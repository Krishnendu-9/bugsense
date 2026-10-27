import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import { useSocketEvent } from '../../hooks/useSocket.js';
import Avatar from '../common/Avatar.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import { timeAgo } from '../../utils/helpers.js';

/*
 * A bug's discussion. Comments load once per bug; live additions and
 * deletions arrive over the socket (the page has joined the bug's room), so
 * they are not refetched whenever the bug itself changes.
 */
export default function BugComments({ bugId, user }) {
  const [comments, setComments] = useState([]);
  const [posting, setPosting] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState(null);
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    let cancelled = false;
    api.get(`/comments/bug/${bugId}`)
      .then((res) => { if (!cancelled) setComments(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bugId]);

  useSocketEvent(
    'comment:added',
    useCallback(
      (newComment) => {
        const commentBugId = newComment?.bug?._id ?? newComment?.bug;
        if (commentBugId !== bugId) return;

        setComments((prev) => {
          if (prev.some((c) => c._id === newComment._id)) return prev;
          if (newComment.author?._id !== user?._id) {
            toast(`New comment from ${newComment.author?.name || 'team member'}`, { icon: <MessageSquare size={16} className="text-muted" aria-hidden="true" /> });
          }
          return [...prev, newComment];
        });
      },
      [bugId, user]
    )
  );

  useSocketEvent(
    'comment:deleted',
    useCallback(
      ({ _id, bugId: deletedFrom }) => {
        if (deletedFrom && deletedFrom !== bugId) return;
        setComments((prev) => prev.filter((c) => c._id !== _id));
        // Deleted elsewhere while we were asking whether to delete it.
        setCommentToDelete((pending) => (pending?._id === _id ? null : pending));
      },
      [bugId]
    )
  );

  const addComment = async (data) => {
    if (!data.content?.trim()) return;
    setPosting(true);
    try {
      const res = await api.post('/comments', { bugId, content: data.content.trim() });
      setComments((prev) => (prev.some((c) => c._id === res.data._id) ? prev : [...prev, res.data]));
      reset();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add comment');
    } finally {
      setPosting(false);
    }
  };

  // Runs from the confirmation dialog only. On failure the dialog stays open
  // (with the error toast) so the person can retry or cancel.
  const deleteComment = async () => {
    const commentId = commentToDelete?._id;
    if (!commentId) return;
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c._id !== commentId));
      setCommentToDelete(null);
      toast.success('Comment deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete comment');
    }
  };

  const submit = handleSubmit(addComment);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={15} className="text-muted" />
        <h3 className="text-sm font-semibold text-fg">Comments ({comments.length})</h3>
      </div>
      <div className="space-y-4 mb-5">
        {comments.map((comment) => (
          <div key={comment._id} className="flex gap-3">
            <div className="mt-0.5">
              <Avatar person={comment.author} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-fg">{comment.author?.name}</span>
                <span className="text-xs text-muted">{timeAgo(comment.createdAt)}</span>
              </div>
              <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap break-words">{comment.content}</p>
            </div>
            {/* Beside the author line, not down the comment's edge; always
                visible (no hover on touch); asks before deleting. The negative
                margins keep the 40px target from adding height. */}
            {(comment.author?._id === user?._id || user?.role === 'admin') && (
              <button
                type="button"
                onClick={() => setCommentToDelete(comment)}
                aria-label={`Delete comment by ${comment.author?.name || 'unknown'}`}
                title="Delete comment"
                className="self-start -mt-2 -mr-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-subtle hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-muted text-center py-4">No comments yet. Be the first!</p>
        )}
      </div>
      <form onSubmit={submit} className="flex gap-3">
        <div className="mt-1">
          <Avatar person={user} />
        </div>
        <div className="flex-1 flex gap-2 items-end">
          <div className="flex-1">
            <textarea
              {...register('content', { required: true })}
              rows={2}
              maxLength={2000}
              aria-label="Add a comment"
              aria-describedby="comment-hint"
              // Enter makes a new line (comments are often several); the
              // shortcut posts, as in most chat and review tools.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="input-field w-full text-sm resize-y min-h-[2.75rem]"
              placeholder="Add a comment..."
            />
            <p id="comment-hint" className="mt-1 text-[11px] text-subtle">Ctrl+Enter (⌘+Enter on Mac) to post</p>
          </div>
          <button
            type="submit"
            disabled={posting}
            aria-label="Post comment"
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3 mb-5 disabled:opacity-60"
          >
            <Send size={14} className={posting ? 'animate-pulse' : ''} />
          </button>
        </div>
      </form>

      {commentToDelete && (
        <ConfirmDialog
          title="Delete this comment?"
          message={`${commentToDelete.author?._id === user?._id ? 'Your comment' : `${commentToDelete.author?.name || 'This person'}'s comment`} will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete comment"
          danger
          onConfirm={deleteComment}
          onCancel={() => setCommentToDelete(null)}
        />
      )}
    </div>
  );
}
