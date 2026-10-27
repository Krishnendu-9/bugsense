import mongoose from 'mongoose';
import { analyzeError, generateGitPatch, generatePostMortem } from '../services/ai.service.js';
import { emitBugUpdated } from '../services/bugEvents.service.js';
import { canModifyBug } from '../utils/permissions.js';
import Bug from '../models/Bug.model.js';

// Resolves an optional bugId from the request. Results are only persisted onto
// a bug the caller may modify; anyone may still run a one-off analysis.
const loadBug = async (bugId, user, { requireWrite }) => {
  if (!bugId) return { bug: null };
  if (!mongoose.isValidObjectId(bugId)) return { error: [404, 'Bug not found'] };

  const bug = await Bug.findById(bugId);
  if (!bug) return { error: [404, 'Bug not found'] };
  if (requireWrite && !canModifyBug(user, bug)) {
    return { error: [403, 'Not authorized to update this bug'] };
  }
  return { bug };
};

export const analyzeErrorLog = async (req, res, next) => {
  const { errorLog, bugContext, bugId } = req.body;

  try {
    const { bug, error } = await loadBug(bugId, req.user, { requireWrite: true });
    if (error) return res.status(error[0]).json({ message: error[1] });

    // An analysis saved on a bug must describe that bug, so it is run on the
    // bug's stored log and description, never on text from the request. The
    // body is only read for a one-off analysis with no bug.
    const log = bug ? bug.errorLog : errorLog;
    const context = bug ? bug.description : typeof bugContext === 'string' ? bugContext : '';
    if (typeof log !== 'string' || !log.trim()) {
      return res.status(400).json({ message: bug ? 'This bug has no error log to analyze' : 'Error log is required' });
    }

    // analyzeError never rethrows — it falls back to heuristics and says so
    // through `source`.
    const insights = await analyzeError(log, context);

    if (bug) {
      bug.aiInsights = { ...insights, analyzedAt: new Date() };
      await bug.save();
      await emitBugUpdated(bug);
    }

    return res.json({ ...insights, analyzedAt: bug?.aiInsights?.analyzedAt || new Date() });
  } catch (err) {
    return next(err);
  }
};

export const createGitPatch = async (req, res, next) => {
  const { bugId, errorLog, bugDescription, steps } = req.body;

  try {
    const { bug, error } = await loadBug(bugId, req.user, { requireWrite: true });
    if (error) return res.status(error[0]).json({ message: error[1] });

    // As for analyses: a patch saved on a bug is generated from that bug.
    const errText = bug ? bug.errorLog || '' : (typeof errorLog === 'string' && errorLog) || '';
    const descText = bug ? bug.description || '' : (typeof bugDescription === 'string' && bugDescription) || '';
    const stepsArr = bug ? bug.steps || [] : Array.isArray(steps) ? steps.map(String) : [];

    if (!errText && !descText) {
      return res.status(400).json({ message: 'Error log or bug description is required to generate a patch' });
    }

    const patch = await generateGitPatch(errText, descText, stepsArr);

    // Only a real model-generated diff is worth keeping on the bug.
    if (bug && patch.source === 'claude') {
      bug.gitPatch = { diff: patch.diff, explanation: patch.explanation, generatedAt: patch.generatedAt };
      await bug.save();
      await emitBugUpdated(bug);
    }

    return res.json(patch);
  } catch (err) {
    return next(err);
  }
};

export const createPostMortem = async (req, res, next) => {
  const { bugId } = req.body;
  if (!bugId) {
    return res.status(400).json({ message: 'bugId is required to generate a post-mortem' });
  }

  try {
    // A post-mortem is a paid model call about one bug, so it takes the same
    // right as analysing or patching it: staff, or the bug's reporter.
    const { bug, error } = await loadBug(bugId, req.user, { requireWrite: true });
    if (error) return res.status(error[0]).json({ message: error[1] });

    const postMortem = await generatePostMortem(bug);
    return res.json(postMortem);
  } catch (err) {
    return next(err);
  }
};
