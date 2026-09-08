import { Router } from 'express';
import { body } from 'express-validator';
import {
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
  updateWebhooks,
  testWebhook,
} from '../controllers/user.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

const router = Router();

router.get('/profile', protect, getUserProfile);

router.put(
  '/profile',
  protect,
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('newPassword')
      .optional()
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ],
  updateUserProfile
);

router.post('/avatar', protect, upload.single('avatar'), uploadAvatar);

router.put('/webhooks', protect, updateWebhooks);
router.post('/webhooks/test', protect, testWebhook);

export default router;
