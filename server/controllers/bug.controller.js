import { validationResult } from 'express-validator';
import Bug from '../models/Bug.model.js';
import Comment from '../models/Comment.model.js';
import { getIO } from '../config/socket.js';
import { generateFingerprint } from '../utils/fingerprint.util.js';
import { dispatchWebhookAlert } from '../services/webhook.service.js';
import { logActivity } from '../services/audit.service.js';

// Escapes user input before it is used inside a RegExp filter.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Fields a client may change through PUT /api/bugs/:id. Everything else
// (reporter, fingerprint, occurrences, source, githubIssue, firstSeenAt,
// statusHistory) is managed server-side only.
const UPDATABLE_BUG_FIELDS = [
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
  'screenshot',
  'annotatedScreenshot',
];

export const getBugs = async (req, res) => {
  try {
    const { status, priority, assignedTo, reporter, project, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (reporter) filter.reporter = reporter;
    if (project) filter.project = project;
    if (search?.trim()) {
      const term = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ title: term }, { description: term }, { errorLog: term }, { tags: term }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [bugs, total] = await Promise.all([
      Bug.find(filter)
        .populate('reporter', 'name email avatar')
        .populate('assignedTo', 'name email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Bug.countDocuments(filter),
    ]);

    return res.json({ bugs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const createBug = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  try {
    const fingerprint = generateFingerprint(req.body.errorLog, req.body.title, req.body.project);

    // Only fold a report into an existing incident when it carries a real stack
    // trace, or when it came from the SDK/API. Two people filing unrelated bugs
    // that happen to share a title must stay separate reports.
    const canDeduplicate =
      Boolean(fingerprint) &&
      (Boolean(req.body.errorLog?.trim()) || (req.body.source && req.body.source !== 'manual'));

    if (canDeduplicate) {
      const existingBug = await Bug.findOne({ fingerprint });
      if (existingBug) {
        existingBug.occurrences = (existingBug.occurrences || 1) + 1;
        existingBug.lastSeenAt = new Date();

        let eventType = 'updated';
        // Auto-detect regression
        if (existingBug.status === 'resolved' || existingBug.status === 'closed') {
          existingBug.status = 'in-progress';
          existingBug.statusHistory.push({
            status: 'in-progress',
            changedBy: req.user?._id || null,
            changedAt: new Date(),
            note: 'Regression auto-detected: error re-occurred in production.',
          });
          eventType = 'regression';
        }

        if (req.body.breadcrumbs?.length) {
          existingBug.breadcrumbs = req.body.breadcrumbs;
        }

        await existingBug.save();
        await existingBug.populate('reporter', 'name email avatar');
        await existingBug.populate('assignedTo', 'name email avatar');

        getIO().emit('bug:updated', existingBug);
        getIO().to(`bug:${existingBug._id}`).emit('bug:detail:updated', existingBug);
        dispatchWebhookAlert(existingBug, eventType);

        return res.status(200).json(existingBug);
      }
    }

    const payload = {};
    for (const field of UPDATABLE_BUG_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
      const value = req.body[field];
      payload[field] = field === 'assignedTo' && !value ? null : value;
    }
    if (Array.isArray(req.body.breadcrumbs)) payload.breadcrumbs = req.body.breadcrumbs;

    const bug = await Bug.create({
      ...payload,
      fingerprint,
      occurrences: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      reporter: req.user?._id || null,
      source: req.body.source || 'manual',
    });

    await bug.populate('reporter', 'name email avatar');

    getIO().emit('bug:created', bug);
    dispatchWebhookAlert(bug, 'created');
    logActivity({
      action: 'BUG_CREATED',
      entityType: 'bug',
      entityId: bug._id,
      performedBy: req.user?._id || null,
      performedByName: req.user?.name || 'Anonymous Reporter',
      details: `Reported incident: "${bug.title}" (${bug.severity} / ${bug.priority})`,
    });

    return res.status(201).json(bug);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getBugById = async (req, res) => {
  try {
    const bug = await Bug.findById(req.params.id)
      .populate('reporter', 'name email avatar')
      .populate('assignedTo', 'name email avatar')
      .populate({
        path: 'comments',
        populate: { path: 'author', select: 'name email avatar' },
      })
      .populate('statusHistory.changedBy', 'name avatar');

    if (!bug) return res.status(404).json({ message: 'Bug not found' });
    return res.json(bug);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateBug = async (req, res) => {
  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const isOwner = bug.reporter?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isDeveloper = req.user.role === 'developer';

    if (!isOwner && !isAdmin && !isDeveloper) {
      return res.status(403).json({ message: 'Not authorized to update this bug' });
    }

    if (req.body.status && req.body.status !== bug.status) {
      bug.statusHistory.push({
        status: req.body.status,
        changedBy: req.user._id,
        changedAt: new Date(),
        note: req.body.statusNote || '',
      });
    }

    // Whitelist client-writable fields — never let a request rewrite
    // ownership, dedup or telemetry bookkeeping.
    for (const field of UPDATABLE_BUG_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
      const value = req.body[field];
      // An unassigned <select> submits '', which Mongoose cannot cast to ObjectId.
      bug[field] = field === 'assignedTo' && !value ? null : value;
    }
    await bug.save();

    await bug.populate('reporter', 'name email avatar');
    await bug.populate('assignedTo', 'name email avatar');
    await bug.populate('statusHistory.changedBy', 'name avatar');

    getIO().emit('bug:updated', bug);
    getIO().to(`bug:${bug._id}`).emit('bug:detail:updated', bug);
    logActivity({
      action: 'BUG_UPDATED',
      entityType: 'bug',
      entityId: bug._id,
      performedBy: req.user?._id || null,
      performedByName: req.user?.name || 'Team Member',
      details: `Updated incident #${bug._id.toString().slice(-6)} (Status: ${bug.status}, Priority: ${bug.priority})`,
    });

    return res.json(bug);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteBug = async (req, res) => {
  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    await Comment.deleteMany({ bug: bug._id });
    await bug.deleteOne();

    getIO().emit('bug:deleted', { _id: req.params.id });
    logActivity({
      action: 'BUG_DELETED',
      entityType: 'bug',
      entityId: req.params.id,
      performedBy: req.user?._id || null,
      performedByName: req.user?.name || 'Administrator',
      details: `Deleted incident: "${bug.title}" (${bug.occurrences || 1} occurrence(s))`,
    });

    return res.json({ message: 'Bug deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const uploadScreenshot = async (req, res) => {
  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    bug.screenshot = `/uploads/${req.file.filename}`;
    await bug.save();

    getIO().to(`bug:${bug._id}`).emit('bug:detail:updated', { _id: bug._id, screenshot: bug.screenshot });

    return res.json({ screenshot: bug.screenshot });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const [total, open, inProgress, resolved, closed, byPriority, recent] = await Promise.all([
      Bug.countDocuments(),
      Bug.countDocuments({ status: 'open' }),
      Bug.countDocuments({ status: 'in-progress' }),
      Bug.countDocuments({ status: 'resolved' }),
      Bug.countDocuments({ status: 'closed' }),
      Bug.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Bug.find().sort({ createdAt: -1 }).limit(5).populate('reporter', 'name avatar'),
    ]);

    return res.json({ total, open, inProgress, resolved, closed, byPriority, recent });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const exportToGitHub = async (req, res) => {
  const { repoOwner, repoName, githubToken } = req.body;
  const token = githubToken || process.env.GITHUB_TOKEN;

  if (!repoOwner || !repoName) {
    return res.status(400).json({ message: 'Repository owner and name are required' });
  }

  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const issueBody = `## Bug Report: ${bug.title}

${bug.description?.replace(/<[^>]*>?/gm, '') || ''}

${bug.steps?.length ? `### Steps to Reproduce\n${bug.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : ''}
${bug.errorLog ? `### Error Log\n\`\`\`\n${bug.errorLog}\n\`\`\`\n` : ''}
${bug.aiInsights?.possibleCause ? `### AI Diagnosis\n**Possible Cause:** ${bug.aiInsights.possibleCause}\n\n**Suggested Fix:**\n${bug.aiInsights.suggestedFix}\n` : ''}

---
- **Priority:** ${bug.priority}
- **Severity:** ${bug.severity}
- **Occurrences:** ${bug.occurrences || 1}
- **Tracked in BugSense:** [View in BugSense](${clientUrl}/bugs/${bug._id})
`;

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'BugSense-Observability',
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const ghRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `[BugSense] ${bug.title}`,
        body: issueBody,
        labels: ['bug', bug.priority].filter(Boolean),
      }),
    });

    if (!ghRes.ok) {
      const errData = await ghRes.json().catch(() => ({}));
      return res.status(ghRes.status).json({
        message: errData.message || 'GitHub API rejected the request. Ensure repo exists and token has "repo" scope.',
      });
    }

    const ghIssue = await ghRes.json();
    bug.githubIssue = {
      url: ghIssue.html_url,
      issueNumber: ghIssue.number,
      exportedAt: new Date(),
    };
    await bug.save();

    logActivity({
      action: 'GITHUB_EXPORTED',
      entityType: 'bug',
      entityId: bug._id,
      performedBy: req.user?._id || null,
      performedByName: req.user?.name || 'Developer',
      details: `Exported incident to GitHub: ${repoOwner}/${repoName} #${ghIssue.number}`,
    });

    return res.json({
      message: 'Bug successfully converted to GitHub Issue',
      githubIssue: bug.githubIssue,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
