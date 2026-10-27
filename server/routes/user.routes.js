import { Router } from 'express';
import { body } from 'express-validator';
import {
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
  updateWebhooks,
  testWebhook,
  listAssignableUsers,
  listUsers,
  updateUserRole,
} from '../controllers/user.controller.js';
import { protect, authorize, adminOnly } from '../middleware/auth.middleware.js';
import upload, { verifyImageContent } from '../middleware/upload.middleware.js';

const router = Router();

router.get('/', protect, adminOnly, listUsers);

router.get('/assignable', protect, authorize('developer', 'admin'), listAssignableUsers);

router.put('/:id/role', protect, adminOnly, updateUserRole);

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
      .isLength({ min: 8, max: 72 })
      .withMessage('New password must be 8 to 72 characters'),
  ],
  updateUserProfile
);

router.post('/avatar', protect, upload.single('avatar'), verifyImageContent, uploadAvatar);

router.put('/webhooks', protect, updateWebhooks);
router.post('/webhooks/test', protect, testWebhook);

export default router;
