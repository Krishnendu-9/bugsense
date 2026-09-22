import { Router } from 'express';
import { body } from 'express-validator';
import {
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
  updateWebhooks,
  testWebhook,
  listAssignableUsers,
} from '../controllers/user.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

const router = Router();

router.get('/assignable', protect, authorize('developer', 'admin'), listAssignableUsers);

router.get('/profile', protect, getUserProfile);

router.put(
  '/profile',
  protect,
  [
    body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty')
      .isLength({ max: 60 }).withMessage('Name cannot exceed 60 characters'),
    body('currentPassword').optional().isString(),
    body('newPassword')
      .optional()
      .isString()
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ],
  updateUserProfile
);

router.post('/avatar', protect, upload.single('avatar'), uploadAvatar);

router.put('/webhooks', protect, updateWebhooks);
router.post('/webhooks/test', protect, testWebhook);

export default router;
