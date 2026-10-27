import { Router } from 'express';
import { analyzeErrorLog, createGitPatch, createPostMortem } from '../controllers/ai.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { aiLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

// The error log is checked in the controller: a one-off analysis must send
// one, while an analysis of a saved bug reads the bug's own.
router.post('/analyze', protect, aiLimiter, analyzeErrorLog);

router.post('/generate-patch', protect, aiLimiter, createGitPatch);

router.post('/post-mortem', protect, aiLimiter, createPostMortem);

export default router;
