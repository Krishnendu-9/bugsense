import { validationResult } from 'express-validator';
import { analyzeError, generateGitPatch, generatePostMortem } from '../services/ai.service.js';
import Bug from '../models/Bug.model.js';

export const analyzeErrorLog = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { errorLog, bugContext, bugId } = req.body;

  try {
    const insights = await analyzeError(errorLog, bugContext);

    if (bugId) {
      await Bug.findByIdAndUpdate(bugId, {
        'aiInsights.possibleCause': insights.possibleCause,
        'aiInsights.suggestedFix': insights.suggestedFix,
        'aiInsights.analyzedAt': new Date(),
      });
    }

    return res.json(insights);
  } catch (err) {
    // analyzeError never rethrows — it falls back to heuristics — so anything
    // landing here is a database or persistence failure.
    return res.status(500).json({ message: err.message });
  }
};

export const createGitPatch = async (req, res) => {
  const { bugId, errorLog, bugDescription, steps } = req.body;

  try {
    let errText = errorLog;
    let descText = bugDescription;
    let stepsArr = steps;

    if (bugId) {
      const bug = await Bug.findById(bugId);
      if (bug) {
        errText = errText || bug.errorLog;
        descText = descText || bug.description;
        stepsArr = stepsArr || bug.steps;
      }
    }

    if (!errText && !descText) {
      return res.status(400).json({ message: 'Error log or bug description is required to generate a patch' });
    }

    const patch = await generateGitPatch(errText, descText, stepsArr);

    if (bugId) {
      await Bug.findByIdAndUpdate(bugId, {
        gitPatch: patch,
      });
    }

    return res.json(patch);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const createPostMortem = async (req, res) => {
  const { bugId } = req.body;
  if (!bugId) {
    return res.status(400).json({ message: 'bugId is required to generate an incident post-mortem' });
  }

  try {
    const bug = await Bug.findById(bugId);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const postMortem = await generatePostMortem(bug);
    return res.json(postMortem);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
