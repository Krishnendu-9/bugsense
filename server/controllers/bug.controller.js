import mongoose from 'mongoose';
import { validationResult } from 'express-validator';
import Bug from '../models/Bug.model.js';
import Comment from '../models/Comment.model.js';
import User from '../models/User.model.js';
import { generateFingerprint } from '../utils/fingerprint.util.js';
import { sanitizeRichText } from '../utils/sanitize.js';
import { canModifyBug, isStaff } from '../utils/permissions.js';
import { removeUpload } from '../utils/uploads.js';
import { dispatchWebhookAlert } from '../services/webhook.service.js';
import { logActivity } from '../services/audit.service.js';
import {
  BUG_POPULATE,
  emitBugCreated,
  emitBugDeleted,
  emitBugUpdated,
} from '../services/bugEvents.service.js';

const STATUSES = ['open', 'in-progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const MAX_PAGE_SIZE = 100;

// Heavy per-bug fields the list views never render. Leaving them out keeps
// list responses small as incidents accumulate telemetry.
const LIST_EXCLUDED_FIELDS = '-breadcrumbs -gitPatch -statusHistory -aiInsights -errorLog -browserInfo';

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

const pickWritableFields = (body) => {
  const payload = {};
  for (const field of WRITABLE_BUG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    payload[field] = body[field];
  }
  if ('description' in payload) payload.description = sanitizeRichText(payload.description);
  // An unassigned <select> submits '', which Mongoose cannot cast to ObjectId.
  if ('assignedTo' in payload && !payload.assignedTo) payload.assignedTo = null;
  return payload;
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

    const [bugs, total] = await Promise.all([
      Bug.find(filter)
        .select(LIST_EXCLUDED_FIELDS)
        .populate('reporter', 'name email avatar')
        .populate('assignedTo', 'name email avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Bug.countDocuments(filter),
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
    const payload = pickWritableFields(req.body);

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
      details: `Reported incident: "${bug.title}" (${bug.severity} / ${bug.priority})`,
    });

    const body = bug.toObject();
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

    const payload = pickWritableFields(req.body);

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
      details: `Updated incident #${bug._id.toString().slice(-6)} (Status: ${bug.status}, Priority: ${bug.priority})`,
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
    await Promise.all([removeUpload(bug.screenshot), removeUpload(bug.annotatedScreenshot)]);

    emitBugDeleted(bug._id);
    logActivity({
      action: 'BUG_DELETED',
      entityType: 'bug',
      entityId: bug._id,
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: `Deleted incident: "${bug.title}" (${bug.occurrences || 1} occurrence(s))`,
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
    bug[field] = `/uploads/${req.file.filename}`;
    await bug.save();
    await removeUpload(previous);
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
    const [total, open, inProgress, resolved, closed, byPriority, recent] = await Promise.all([
      Bug.countDocuments(),
      Bug.countDocuments({ status: 'open' }),
      Bug.countDocuments({ status: 'in-progress' }),
      Bug.countDocuments({ status: 'resolved' }),
      Bug.countDocuments({ status: 'closed' }),
      Bug.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Bug.find().select('title status priority createdAt reporter').sort({ createdAt: -1 }).limit(5).populate('reporter', 'name avatar'),
    ]);

    return res.json({ total, open, inProgress, resolved, closed, byPriority, recent });
  } catch (err) {
    return next(err);
  }
};

// GitHub's own naming rules; anything else could smuggle extra path segments
// into the API URL.
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO = /^[A-Za-z0-9._-]{1,100}$/;

export const exportToGitHub = async (req, res, next) => {
  const { repoOwner, repoName, githubToken } = req.body;

  if (typeof repoOwner !== 'string' || typeof repoName !== 'string' || !repoOwner || !repoName) {
    return badRequest(res, 'Repository owner and name are required');
  }
  if (!GITHUB_OWNER.test(repoOwner) || !GITHUB_REPO.test(repoName) || repoName === '.' || repoName === '..') {
    return badRequest(res, 'Repository owner or name contains invalid characters');
  }

  const token = typeof githubToken === 'string' && githubToken ? githubToken : process.env.GITHUB_TOKEN;
  if (!token) {
    return badRequest(res, 'A GitHub token is required (none is configured on the server)');
  }

  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
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
          'User-Agent': 'BugSense-Observability',
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
      details: `Exported incident to GitHub: ${repoOwner}/${repoName} #${ghIssue.number}`,
    });

    return res.json({
      message: 'Bug successfully converted to GitHub Issue',
      githubIssue: bug.githubIssue,
    });
  } catch (err) {
    return next(err);
  }
};
