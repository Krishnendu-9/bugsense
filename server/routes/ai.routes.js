import { Router } from 'express';
import { body } from 'express-validator';
import { analyzeErrorLog, createGitPatch, createPostMortem } from '../controllers/ai.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { aiLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.post(
  '/analyze',
  protect,
  aiLimiter,
  [body('errorLog').trim().notEmpty().withMessage('Error log is required')],
  analyzeErrorLog
);

router.post('/generate-patch', protect, aiLimiter, createGitPatch);

router.post('/post-mortem', protect, aiLimiter, createPostMortem);

export default router;
