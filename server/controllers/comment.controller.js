import mongoose from 'mongoose';
import { validationResult } from 'express-validator';
import Comment from '../models/Comment.model.js';
import Bug from '../models/Bug.model.js';
import { broadcast } from '../config/socket.js';
import { logActivity } from '../services/audit.service.js';

export const addComment = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { bugId, content } = req.body;

  try {
    if (!mongoose.isValidObjectId(bugId)) return res.status(404).json({ message: 'Bug not found' });
    const bug = await Bug.findById(bugId).select('_id title');
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const comment = await Comment.create({ bug: bugId, author: req.user._id, content });
    await Bug.updateOne({ _id: bugId }, { $push: { comments: comment._id } });

    await comment.populate('author', 'name email avatar');

    broadcast('comment:added', comment, `bug:${bugId}`);
    // entityId is the bug, so the audit trail can link straight to it.
    logActivity({
      action: 'COMMENT_ADDED',
      entityType: 'comment',
      entityId: bugId,
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: `Commented on "${bug.title}"`,
      metadata: { commentId: comment._id.toString() },
    });

    return res.status(201).json(comment);
  } catch (err) {
    return next(err);
  }
};

export const getCommentsByBug = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.bugId)) return res.json([]);

    const comments = await Comment.find({ bug: req.params.bugId })
      .populate('author', 'name email avatar')
      .sort({ createdAt: 1 });

    return res.json(comments);
  } catch (err) {
    return next(err);
  }
};

export const deleteComment = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Comment not found' });
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const isAuthor = comment.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    const bugId = comment.bug.toString();
    await Bug.findByIdAndUpdate(comment.bug, { $pull: { comments: comment._id } });
    await comment.deleteOne();

    broadcast('comment:deleted', { _id: req.params.id, bugId }, `bug:${bugId}`);
    logActivity({
      action: 'COMMENT_DELETED',
      entityType: 'comment',
      entityId: bugId,
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: isAuthor ? 'Deleted their own comment' : 'Deleted a comment as admin',
      metadata: { commentId: req.params.id },
    });

    return res.json({ message: 'Comment deleted successfully' });
  } catch (err) {
    return next(err);
  }
};
