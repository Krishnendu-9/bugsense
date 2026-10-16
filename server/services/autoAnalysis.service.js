import Bug from '../models/Bug.model.js';
import { analyzeError } from './ai.service.js';
import { emitBugUpdated } from './bugEvents.service.js';

/**
 * Analyses a new bug's error log after the response has been sent, then saves
 * the insights and pushes them to open clients over the socket. `tryConsume`
 * is the hourly budget to charge. Returns whether an analysis was started, so
 * the client knows to show a pending state.
 */
export const queueAutoAnalysis = (bug, tryConsume) => {
  if (!bug.errorLog?.trim() || !tryConsume()) return false;

  analyzeError(bug.errorLog, bug.description)
    .then(async (insights) => {
      const updated = await Bug.findByIdAndUpdate(
        bug._id,
        { aiInsights: { ...insights, analyzedAt: new Date() } },
        { new: true }
      );
      if (updated) await emitBugUpdated(updated);
    })
    .catch((err) => console.warn('Background AI analysis error:', err.message));

  return true;
};
