import { validationResult } from 'express-validator';
import Comment from '../models/Comment.model.js';
import Bug from '../models/Bug.model.js';
import { getIO } from '../config/socket.js';

export const addComment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { bugId, content } = req.body;

  try {
    const bug = await Bug.findById(bugId);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    const comment = await Comment.create({ bug: bugId, author: req.user._id, content });
    bug.comments.push(comment._id);
    await bug.save();

    await comment.populate('author', 'name email avatar');

    getIO().to(`bug:${bugId}`).emit('comment:added', comment);

    return res.status(201).json(comment);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getCommentsByBug = async (req, res) => {
  try {
    const comments = await Comment.find({ bug: req.params.bugId })
      .populate('author', 'name email avatar')
      .sort({ createdAt: 1 });

    return res.json(comments);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteComment = async (req, res) => {
  try {
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

    getIO().to(`bug:${bugId}`).emit('comment:deleted', { _id: req.params.id, bugId });

    return res.json({ message: 'Comment deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
