import mongoose from 'mongoose';
import { validationResult } from 'express-validator';
import Bug from '../models/Bug.model.js';
import Comment from '../models/Comment.model.js';
import User from '../models/User.model.js';
import { generateFingerprint } from '../utils/fingerprint.util.js';
import { sanitizeRichText } from '../utils/sanitize.js';
import { canModifyBug, canSetStatus, isStaff } from '../utils/permissions.js';
import { removeUpload } from '../utils/uploads.js';
import { removeStoredFile, storeUpload } from '../services/storage.service.js';
import { getPrimaryClientUrl } from '../utils/clientOrigins.js';
import { dispatchWebhookAlert } from '../services/webhook.service.js';
import { queueAutoAnalysis } from '../services/autoAnalysis.service.js';
import { tryConsumeReportAIBudget } from '../utils/aiBudget.js';
import { logActivity } from '../services/audit.service.js';
import { countResolvedSince, openCountsByDay, resolutionStats, windowStart } from '../utils/bugStats.js';
import {
  BUG_POPULATE,
  LIST_EXCLUDED_FIELDS,
  emitBugCreated,
  emitBugDeleted,
  emitBugUpdated,
} from '../services/bugEvents.service.js';

const STATUSES = ['open', 'in-progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const MAX_PAGE_SIZE = 100;
const LIST_QUERY_TIME_LIMIT_MS = 5000;

// Leaving heavy fields out keeps list responses small as incidents accumulate
// telemetry; the same list is applied to broadcast socket events.
const LIST_PROJECTION = LIST_EXCLUDED_FIELDS.map((field) => `-${field}`).join(' ');

// Escapes user input before it is used inside a RegExp filter.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const badRequest = (res, message) => res.status(400).json({ message });

// Fields a client may set through POST/PUT. Everything else (reporter,
// fingerprint, occurrences, source, screenshots, githubIssue, statusHistory) is
// managed server-side only.
const WRITABLE_BUG_FIELDS = [
  'title',
  'description',
  'steps',
  'priority',
  'status',
  'severity',
  'project',
  'tags',
  'assignedTo',
  'errorLog',
  'browserInfo',
];

const LIMITS = {
  steps: 50,
  stepLength: 500,
  tags: 20,
  tagLength: 40,
  errorLog: 20000,
  project: 100,
  browserField: 500,
};

// Turns a submitted list into trimmed, non-empty strings, or null when the
// value is not a list at all.
const toStringList = (value, maxItems, maxLength) => {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item) => typeof item === 'string' || typeof item === 'number')
    .map((item) => String(item).trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
};

/**
 * Copies the client-writable fields from a request body and normalises them.
 * Returns { payload } or { error } with a message for a 400.
 */
const pickWritableFields = (body) => {
  const payload = {};
  for (const field of WRITABLE_BUG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    payload[field] = body[field];
  }

  for (const field of ['title', 'priority', 'status', 'severity', 'project', 'errorLog']) {
    if (field in payload && typeof payload[field] !== 'string') return { error: `${field} must be a string` };
  }
  if ('title' in payload) payload.title = payload.title.trim();
  if ('project' in payload) payload.project = payload.project.trim().slice(0, LIMITS.project);
  if ('errorLog' in payload) payload.errorLog = payload.errorLog.slice(0, LIMITS.errorLog);
  if ('description' in payload) payload.description = sanitizeRichText(payload.description);

  if ('steps' in payload) {
    payload.steps = toStringList(payload.steps, LIMITS.steps, LIMITS.stepLength);
    if (!payload.steps) return { error: 'steps must be a list' };
  }
  if ('tags' in payload) {
    const tags = toStringList(payload.tags, LIMITS.tags, LIMITS.tagLength);
    if (!tags) return { error: 'tags must be a list' };
    payload.tags = [...new Set(tags.map((tag) => tag.toLowerCase()))];
  }
  if ('browserInfo' in payload) {
    const info = payload.browserInfo && typeof payload.browserInfo === 'object' ? payload.browserInfo : {};
    payload.browserInfo = Object.fromEntries(
      ['browser', 'version', 'os', 'screenSize', 'userAgent'].map((key) => [
        key,
        typeof info[key] === 'string' ? info[key].slice(0, LIMITS.browserField) : '',
      ])
    );
  }

  // An unassigned <select> submits '', which Mongoose cannot cast to ObjectId.
  if ('assignedTo' in payload && !payload.assignedTo) payload.assignedTo = null;
  return { payload };
};

// Only developers and admins can be assignees.
const assertAssignable = async (assignedTo) => {
  if (!assignedTo) return true;
  if (!mongoose.isValidObjectId(assignedTo)) return false;
  return Boolean(await User.exists({ _id: assignedTo, role: { $in: ['developer', 'admin'] } }));
};

export const getBugs = async (req, res, next) => {
  try {
    const { status, priority, assignedTo, reporter, project, search } = req.query;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));

    // Every filter value is checked to be a plain string of the expected shape,
    // so query-string objects like ?status[$ne]=x can never reach MongoDB.
    const filter = {};
    if (status) {
      if (!STATUSES.includes(status)) return badRequest(res, 'Invalid status filter');
      filter.status = status;
    }
    if (priority) {
      if (!PRIORITIES.includes(priority)) return badRequest(res, 'Invalid priority filter');
      filter.priority = priority;
    }
    for (const [key, value] of [['assignedTo', assignedTo], ['reporter', reporter]]) {
      if (!value) continue;
      if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) return badRequest(res, `Invalid ${key} filter`);
      filter[key] = value;
    }
    if (project) {
      if (typeof project !== 'string') return badRequest(res, 'Invalid project filter');
      filter.project = project;
    }
    if (search) {
      if (typeof search !== 'string') return badRequest(res, 'Invalid search filter');
      if (search.trim()) {
        const term = new RegExp(escapeRegex(search.trim().slice(0, 200)), 'i');
        filter.$or = [{ title: term }, { description: term }, { errorLog: term }, { tags: term }];
      }
    }

    // Substring search is a case-insensitive regex, which scans rather than
    // using an index. That keeps as-you-type matching ("saf" finds "Safari")
    // and is fine at this scale; the time cap stops one expensive search from
    // tying up the database as the collection grows.
    const [bugs, total] = await Promise.all([
      Bug.find(filter)
        .select(LIST_PROJECTION)
        .populate('reporter', 'name email avatar')
        .populate('assignedTo', 'name email avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .maxTimeMS(LIST_QUERY_TIME_LIMIT_MS),
      Bug.countDocuments(filter).maxTimeMS(LIST_QUERY_TIME_LIMIT_MS),
    ]);

    return res.json({ bugs, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
  } catch (err) {
    return next(err);
  }
};

export const createBug = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  try {
    const { payload, error } = pickWritableFields(req.body);
    if (error) return badRequest(res, error);

    // Reporters file bugs; triage (status, assignment) belongs to the team.
    if (!isStaff(req.user)) {
      delete payload.status;
      delete payload.assignedTo;
    }
    if (!(await assertAssignable(payload.assignedTo))) {
      return badRequest(res, 'Bugs can only be assigned to developers or admins');
    }

    const fingerprint = generateFingerprint(payload.errorLog, payload.title, payload.project);

    // Manual reports are never folded into an existing incident: that would
    // silently discard the reporter's description and steps. A matching
    // fingerprint is surfaced as a hint instead, so the reporter can link them.
    const similar = payload.errorLog?.trim()
      ? await Bug.findOne({ fingerprint }).select('_id title').sort({ createdAt: 1 })
      : null;

    const now = new Date();
    const bug = await Bug.create({
      ...payload,
      fingerprint,
      occurrences: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      reporter: req.user._id,
      source: 'manual',
    });

    await emitBugCreated(bug);
    dispatchWebhookAlert(bug, 'created');
    logActivity({
      action: 'BUG_CREATED',
      entityType: 'bug',
      entityId: bug._id,
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: `Reported bug: "${bug.title}" (${bug.severity} / ${bug.priority})`,
    });

    // Analysis runs after the response, so filing a bug never waits on the
    // model; the result reaches the bug page over the socket.
    const analysisQueued = queueAutoAnalysis(bug, tryConsumeReportAIBudget);

    const body = bug.toObject();
    body.analysisQueued = analysisQueued;
    if (similar) body.possibleDuplicateOf = { _id: similar._id, title: similar.title };
    return res.status(201).json(body);
  } catch (err) {
    return next(err);
  }
};

export const getBugById = async (req, res, next) => {
  try {
    const bug = await Bug.findById(req.params.id)
      .populate(BUG_POPULATE)
      .populate({
        path: 'comments',
        populate: { path: 'author', select: 'name email avatar' },
      });

    if (!bug) return res.status(404).json({ message: 'Bug not found' });
    return res.json(bug);
  } catch (err) {
    return next(err);
  }
};

export const updateBug = async (req, res, next) => {
  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    if (!canModifyBug(req.user, bug)) {
      return res.status(403).json({ message: 'Not authorized to update this bug' });
    }

    const { payload, error } = pickWritableFields(req.body);
    if (error) return badRequest(res, error);

    if (payload.status && !canSetStatus(req.user, bug, payload.status)) {
      return res.status(403).json({ message: 'Reporters can only close their own bug or reopen it' });
    }
    if (payload.priority && payload.priority !== bug.priority && !isStaff(req.user)) {
      return res.status(403).json({ message: 'Only developers and admins can change priority' });
    }

    if ('assignedTo' in payload) {
      const current = bug.assignedTo?.toString() || null;
      const next_ = payload.assignedTo ? String(payload.assignedTo) : null;
      if (current === next_) {
        delete payload.assignedTo;
      } else if (!isStaff(req.user)) {
        return res.status(403).json({ message: 'Only developers and admins can assign bugs' });
      } else if (!(await assertAssignable(payload.assignedTo))) {
        return badRequest(res, 'Bugs can only be assigned to developers or admins');
      }
    }

    if (payload.status && payload.status !== bug.status) {
      bug.statusHistory.push({
        status: payload.status,
        changedBy: req.user._id,
        changedAt: new Date(),
        note: typeof req.body.statusNote === 'string' ? req.body.statusNote.slice(0, 500) : '',
      });
    }

    bug.set(payload);
    await bug.save();
    await emitBugUpdated(bug);

    logActivity({
      action: 'BUG_UPDATED',
      entityType: 'bug',
      entityId: bug._id,
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: `Updated bug #${bug._id.toString().slice(-6)} (Status: ${bug.status}, Priority: ${bug.priority})`,
    });

    return res.json(bug);
  } catch (err) {
    return next(err);
  }
};

export const deleteBug = async (req, res, next) => {
  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    await Comment.deleteMany({ bug: bug._id });
    await bug.deleteOne();
    await Promise.all([removeStoredFile(bug.screenshot), removeStoredFile(bug.annotatedScreenshot)]);

    emitBugDeleted(bug._id);
    logActivity({
      action: 'BUG_DELETED',
      entityType: 'bug',
      entityId: bug._id,
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: `Deleted bug: "${bug.title}" (${bug.occurrences || 1} occurrence(s))`,
    });

    return res.json({ message: 'Bug deleted successfully' });
  } catch (err) {
    return next(err);
  }
};

// Shared by the screenshot and annotation uploads: both replace one image field
// on a bug the caller is allowed to modify, and remove the file it replaces.
const replaceBugImage = (field) => async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const bug = await Bug.findById(req.params.id);
    if (!bug || !canModifyBug(req.user, bug)) {
      await removeUpload(`/uploads/${req.file.filename}`);
      if (!bug) return res.status(404).json({ message: 'Bug not found' });
      return res.status(403).json({ message: 'Not authorized to update this bug' });
    }

    const previous = bug[field];
    bug[field] = await storeUpload(req.file);
    await bug.save();
    await removeStoredFile(previous);
    await emitBugUpdated(bug);

    return res.json({ [field]: bug[field] });
  } catch (err) {
    return next(err);
  }
};

export const uploadScreenshot = replaceBugImage('screenshot');
export const uploadAnnotation = replaceBugImage('annotatedScreenshot');

export const getDashboardStats = async (req, res, next) => {
  try {
    const [total, open, inProgress, resolved, closed, byPriority, projectNames, oldestOpen, recent] = await Promise.all([
      Bug.countDocuments(),
      Bug.countDocuments({ status: 'open' }),
      Bug.countDocuments({ status: 'in-progress' }),
      Bug.countDocuments({ status: 'resolved' }),
      Bug.countDocuments({ status: 'closed' }),
      Bug.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      // `project` defaults to an empty string, which is "no project", not one.
      Bug.distinct('project', { project: { $nin: ['', null] } }),
      Bug.findOne({ status: 'open' }).sort({ createdAt: 1 }).select('createdAt').lean(),
      // Most recently *active*, not most recently reported: the dashboard
      // shows an Updated column, which should read in order.
      Bug.find()
        .select('title status priority project assignedTo source occurrences createdAt updatedAt')
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('assignedTo', 'name avatar')
        .lean(),
    ]);

    return res.json({
      total,
      open,
      inProgress,
      resolved,
      closed,
      byPriority,
      projects: projectNames.length,
      // When the longest-waiting open bug was reported; null when none is open.
      oldestOpenAt: oldestOpen?.createdAt ?? null,
      recent,
    });
  } catch (err) {
    return next(err);
  }
};

const TREND_DAYS = 7;
const HISTORY_FIELDS = 'createdAt status statusHistory.status statusHistory.changedAt';

/*
 * Figures reconstructed from statusHistory, kept apart from getDashboardStats
 * because they are a different kind of number: that endpoint is a snapshot of
 * now, these are replays of the past with their own caveats (UTC day
 * boundaries, sample size).
 */
export const getTrendStats = async (_req, res, next) => {
  try {
    const now = new Date();
    const since = new Date(windowStart(now, TREND_DAYS));

    const [windowBugs, resolvedBugs] = await Promise.all([
      // Only bugs whose status could have been 'open' at some point in the
      // window: open now, or changed status during it. Any other bug held one
      // non-open status for the whole window and contributes nothing.
      Bug.find({
        createdAt: { $lte: now },
        $or: [{ status: 'open' }, { 'statusHistory.changedAt': { $gte: since } }],
      })
        .select(HISTORY_FIELDS)
        .lean()
        .maxTimeMS(LIST_QUERY_TIME_LIMIT_MS),
      Bug.find({ 'statusHistory.status': 'resolved' })
        .select(HISTORY_FIELDS)
        .lean()
        .maxTimeMS(LIST_QUERY_TIME_LIMIT_MS),
    ]);

    return res.json({
      openByDay: {
        timezone: 'UTC',
        days: openCountsByDay(windowBugs, now, TREND_DAYS),
      },
      timeToResolve: resolutionStats(resolvedBugs),
      // Same seven UTC days as openByDay, starting at `since`.
      resolvedInWindow: {
        since: since.toISOString(),
        count: countResolvedSince(resolvedBugs, since),
      },
    });
  } catch (err) {
    return next(err);
  }
};

// GitHub's own naming rules; anything else could smuggle extra path segments
// into the API URL.
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO = /^[A-Za-z0-9._-]{1,100}$/;

// Repositories the server's own GITHUB_TOKEN may file issues in, as
// "owner/repo" pairs. Without this list the shared token could be pointed at
// any repository it can reach, by any staff member.
const serverTokenRepos = () =>
  (process.env.GITHUB_ALLOWED_REPOS || '')
    .split(',')
    .map((repo) => repo.trim())
    .filter(Boolean);

export const getGitHubConfig = (_req, res) => {
  res.json({ repos: process.env.GITHUB_TOKEN ? serverTokenRepos() : [] });
};

export const exportToGitHub = async (req, res, next) => {
  const { repoOwner, repoName, githubToken } = req.body;

  if (typeof repoOwner !== 'string' || typeof repoName !== 'string' || !repoOwner || !repoName) {
    return badRequest(res, 'Repository owner and name are required');
  }
  if (!GITHUB_OWNER.test(repoOwner) || !GITHUB_REPO.test(repoName) || repoName === '.' || repoName === '..') {
    return badRequest(res, 'Repository owner or name contains invalid characters');
  }

  let token = typeof githubToken === 'string' && githubToken ? githubToken : null;
  if (!token) {
    if (!process.env.GITHUB_TOKEN) {
      return badRequest(res, 'A GitHub token is required (none is configured on the server)');
    }
    const repo = `${repoOwner}/${repoName}`.toLowerCase();
    if (!serverTokenRepos().some((allowed) => allowed.toLowerCase() === repo)) {
      return badRequest(res, `The server's GitHub token is not enabled for ${repoOwner}/${repoName}. Use your own token, or ask the operator to add it to GITHUB_ALLOWED_REPOS.`);
    }
    token = process.env.GITHUB_TOKEN;
  }

  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const clientUrl = getPrimaryClientUrl();
    const issueBody = `## Bug Report: ${bug.title}

${bug.description?.replace(/<[^>]*>?/gm, '') || ''}

${bug.steps?.length ? `### Steps to Reproduce\n${bug.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : ''}
${bug.errorLog ? `### Error Log\n\`\`\`\n${bug.errorLog}\n\`\`\`\n` : ''}
${bug.aiInsights?.possibleCause ? `### ${bug.aiInsights.source === 'heuristic' ? 'Heuristic' : 'AI'} Diagnosis\n**Possible Cause:** ${bug.aiInsights.possibleCause}\n\n**Suggested Fix:**\n${bug.aiInsights.suggestedFix}\n` : ''}

---
- **Priority:** ${bug.priority}
- **Severity:** ${bug.severity}
- **Occurrences:** ${bug.occurrences || 1}
- **Tracked in BugSense:** [View in BugSense](${clientUrl}/bugs/${bug._id})
`;

    const ghRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/issues`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'BugSense',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `[BugSense] ${bug.title}`,
          body: issueBody,
          labels: ['bug', bug.priority].filter(Boolean),
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!ghRes.ok) {
      const errData = await ghRes.json().catch(() => ({}));
      // GitHub's 401 must not look like a BugSense session expiry to the client.
      const status = ghRes.status === 401 || ghRes.status === 403 ? 400 : ghRes.status >= 500 ? 502 : ghRes.status;
      return res.status(status).json({
        message: `GitHub: ${errData.message || 'request rejected. Check the repository exists and the token has "repo" scope.'}`,
      });
    }

    const ghIssue = await ghRes.json();
    bug.githubIssue = {
      url: ghIssue.html_url,
      issueNumber: ghIssue.number,
      exportedAt: new Date(),
    };
    await bug.save();
    await emitBugUpdated(bug);

    logActivity({
      action: 'GITHUB_EXPORTED',
      entityType: 'bug',
      entityId: bug._id,
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: `Exported bug to GitHub: ${repoOwner}/${repoName} #${ghIssue.number}`,
    });

    return res.json({
      message: 'Bug successfully converted to GitHub Issue',
      githubIssue: bug.githubIssue,
    });
  } catch (err) {
    return next(err);
  }
};
