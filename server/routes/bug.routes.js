import { Router } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import {
  getBugs,
  createBug,
  getBugById,
  updateBug,
  deleteBug,
  uploadScreenshot,
  uploadAnnotation,
  getDashboardStats,
  getTrendStats,
  exportToGitHub,
  getGitHubConfig,
} from '../controllers/bug.controller.js';
import { protect, adminOnly, authorize } from '../middleware/auth.middleware.js';
import upload, { verifyImageContent } from '../middleware/upload.middleware.js';

const router = Router();

// Rejects malformed ids up front with a 404 instead of a Mongoose CastError.
router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Bug not found' });
  next();
});

router.get('/stats', protect, getDashboardStats);
router.get('/stats/trends', protect, getTrendStats);

router.get('/github-config', protect, authorize('developer', 'admin'), getGitHubConfig);

router.get('/', protect, getBugs);

router.post(
  '/',
  protect,
  [
    body('title').isString().trim().notEmpty().withMessage('Title is required'),
    body('description').isString().trim().notEmpty().withMessage('Description is required'),
  ],
  createBug
);

router.get('/:id', protect, getBugById);

router.put('/:id', protect, updateBug);

router.delete('/:id', protect, adminOnly, deleteBug);

router.post('/:id/screenshot', protect, upload.single('screenshot'), verifyImageContent, uploadScreenshot);

router.post('/:id/annotation', protect, upload.single('annotation'), verifyImageContent, uploadAnnotation);

router.post('/:id/github', protect, authorize('developer', 'admin'), exportToGitHub);

export default router;
