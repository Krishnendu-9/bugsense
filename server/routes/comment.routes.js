import { Router } from 'express';
import { body } from 'express-validator';
import { addComment, getCommentsByBug, deleteComment } from '../controllers/comment.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.post(
  '/',
  protect,
  [
    body('bugId').notEmpty().withMessage('Bug ID is required'),
    body('content').trim().notEmpty().withMessage('Comment content is required'),
  ],
  addComment
);

router.get('/bug/:bugId', protect, getCommentsByBug);

router.delete('/:id', protect, deleteComment);

export default router;
