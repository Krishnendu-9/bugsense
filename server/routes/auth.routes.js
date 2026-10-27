import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, getMe, getAuthConfig } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.get('/config', getAuthConfig);

router.post(
  '/register',
  authLimiter,
  [
    body('name').isString().trim().notEmpty().withMessage('Name is required'),
    body('email').isString().trim().toLowerCase().isEmail().withMessage('Valid email is required'),
    // bcrypt only reads the first 72 bytes, so a longer password would
    // silently match any other with the same start.
    body('password').isString().isLength({ min: 8, max: 72 }).withMessage('Password must be 8 to 72 characters'),
  ],
  register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isString().trim().toLowerCase().isEmail().withMessage('Valid email is required'),
    body('password').isString().notEmpty().withMessage('Password is required'),
  ],
  login
);

router.get('/me', protect, getMe);

export default router;
