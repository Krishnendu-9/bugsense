import { Router } from 'express';
import { body } from 'express-validator';
import {
  getBugs,
  createBug,
  getBugById,
  updateBug,
  deleteBug,
  uploadScreenshot,
  getDashboardStats,
  exportToGitHub,
} from '../controllers/bug.controller.js';
import { protect, adminOnly } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

const router = Router();

router.get('/stats', protect, getDashboardStats);

router.get('/', protect, getBugs);

router.post(
  '/',
  protect,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
  ],
  createBug
);

router.get('/:id', protect, getBugById);

router.put('/:id', protect, updateBug);

router.delete('/:id', protect, adminOnly, deleteBug);

router.post('/:id/screenshot', protect, upload.single('screenshot'), uploadScreenshot);

router.post('/:id/github', protect, exportToGitHub);

export default router;
