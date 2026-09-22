import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Trash2, Edit3, MessageSquare, Send, Monitor,
  Tag, AlertTriangle, Cpu, X, Check, Pencil, History,
  GitPullRequest, ExternalLink, Github, Zap, FileText, UserCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import useAI from '../../hooks/useAI.js';
import useAuth from '../../hooks/useAuth.js';
import useSocket, { useSocketEvent } from '../../hooks/useSocket.js';
import { PriorityBadge, StatusBadge, SeverityBadge } from '../../components/common/Badge.jsx';
import ErrorInsights from '../../components/ai/ErrorInsights.jsx';
import AnnotationCanvas from '../../components/bugs/AnnotationCanvas.jsx';
import BreadcrumbTimeline from '../../components/bugs/BreadcrumbTimeline.jsx';
import GitPatchModal from '../../components/ai/GitPatchModal.jsx';
import PostMortemModal from '../../components/ai/PostMortemModal.jsx';
import { BugDetailSkeleton } from '../../components/common/Loader.jsx';
import {
  timeAgo, getInitials, formatDate, getImageUrl, sanitizeHtml, isStaff, dataUrlToFile,
} from '../../utils/helpers.js';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, STATUS_COLORS } from '../../utils/constants.js';
import api from '../../api/axios.js';

function Avatar({ person, size = 'w-8 h-8', text = 'text-xs' }) {
  return (
    <div className={`${size} rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white ${text} font-bold flex-shrink-0 overflow-hidden`}>
      {person?.avatar ? (
        <img src={getImageUrl(person.avatar)} alt="" className="w-full h-full object-cover" />
      ) : (
        getInitials(person?.name)
      )}
    </div>
  );
}

export default function BugDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { bug, setBug, loading, fetchBugById, updateBug, deleteBug, uploadAnnotation } = useBugs();
  const { loading: aiLoading, analyze } = useAI();
  const [comments, setComments] = useState([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [assignees, setAssignees] = useState([]);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [gitPatch, setGitPatch] = useState(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [postMortem, setPostMortem] = useState(null);
  const [postMortemLoading, setPostMortemLoading] = useState(false);

  const { register, handleSubmit, reset } = useForm();
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit } = useForm();

  const staff = isStaff(user);

  useEffect(() => {
    fetchBugById(id);
  }, [id, fetchBugById]);

  // Comments load once per bug; live additions and deletions arrive over the
  // socket, so they are not refetched every time the bug itself changes.
  useEffect(() => {
    let cancelled = false;
    setComments([]);
    api.get(`/comments/bug/${id}`)
      .then((res) => { if (!cancelled) setComments(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!socket || !id) return undefined;
    // Rooms are per connection, so rejoin after every reconnect.
    const join = () => socket.emit('join:bug', id);
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('leave:bug', id);
    };
  }, [socket, id]);

  useEffect(() => {
    if (!isEditing || !staff || assignees.length) return;
    api.get('/users/assignable').then((res) => setAssignees(res.data)).catch(() => {});
  }, [isEditing, staff, assignees.length]);

  useSocketEvent(
    'bug:detail:updated',
    useCallback(
      (updatedBug) => {
        if (!updatedBug || updatedBug._id !== id) return;

        setBug((prev) => {
          if (prev && updatedBug.status !== prev.status) {
            const lastChange = updatedBug.statusHistory?.[updatedBug.statusHistory.length - 1];
            const changedById = lastChange?.changedBy?._id ?? lastChange?.changedBy;
            if (changedById !== user?._id) {
              const who = lastChange?.changedBy?.name || (lastChange?.changedBy ? 'a team member' : 'the telemetry pipeline');
              toast(`Status changed to "${updatedBug.status}" by ${who}`, { icon: '🔄' });
            }
          }
          // Merge rather than replace, so a partial payload can never blank
          // out fields the page is displaying.
          return prev ? { ...prev, ...updatedBug } : updatedBug;
        });
      },
      [id, setBug, user]
    )
  );

  useSocketEvent(
    'comment:added',
    useCallback(
      (newComment) => {
        const commentBugId = newComment?.bug?._id ?? newComment?.bug;
        if (commentBugId !== id) return;

        setComments((prev) => {
          if (prev.some((c) => c._id === newComment._id)) return prev;
          if (newComment.author?._id !== user?._id) {
            toast(`New comment from ${newComment.author?.name || 'team member'}`, { icon: '💬' });
          }
          return [...prev, newComment];
        });
      },
      [id, user]
    )
  );

  useSocketEvent(
    'comment:deleted',
    useCallback(
      ({ _id, bugId }) => {
        if (bugId && bugId !== id) return;
        setComments((prev) => prev.filter((c) => c._id !== _id));
      },
      [id]
    )
  );

  useSocketEvent(
    'bug:deleted',
    useCallback(
      ({ _id }) => {
        if (_id !== id) return;
        toast('This bug was deleted', { icon: '🗑️' });
        navigate('/bugs');
      },
      [id, navigate]
    )
  );

  const safeDescription = useMemo(() => sanitizeHtml(bug?.description), [bug?.description]);

  const openEditor = () => {
    resetEdit({
      status: bug.status,
      priority: bug.priority,
      statusNote: '',
      ...(staff ? { assignedTo: bug.assignedTo?._id || '' } : {}),
    });
    setIsEditing(true);
  };

  const handleAnalyze = async () => {
    if (!bug?.errorLog) { toast.error('No error log to analyze'); return; }
    const result = await analyze(bug.errorLog, bug.description, bug._id);
    if (!result) return;
    setBug((prev) => (prev ? { ...prev, aiInsights: result } : prev));
    toast.success(result.source === 'claude' ? 'AI analysis complete' : 'Heuristic analysis complete (AI not configured)');
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this bug? This cannot be undone.')) return;
    try {
      await deleteBug(id);
      toast.success('Bug deleted');
      navigate('/bugs');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete bug');
    }
  };

  const handleAddComment = async (data) => {
    if (!data.content?.trim()) return;
    setCommentLoading(true);
    try {
      const res = await api.post('/comments', { bugId: id, content: data.content.trim() });
      setComments((prev) => (prev.some((c) => c._id === res.data._id) ? prev : [...prev, res.data]));
      reset();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add comment');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c._id !== commentId));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete comment');
    }
  };

  const handleEditSubmitFn = async (data) => {
    try {
      await updateBug(id, data);
      toast.success('Bug updated');
      setIsEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update bug');
    }
  };

  const handleSaveAnnotation = async (dataUrl) => {
    setSavingAnnotation(true);
    try {
      const file = await dataUrlToFile(dataUrl, `annotation-${Date.now()}.png`);
      const { annotatedScreenshot } = await uploadAnnotation(id, file);
      setBug((prev) => (prev ? { ...prev, annotatedScreenshot } : prev));
      toast.success('Annotation saved');
      setShowAnnotation(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save annotation');
    } finally {
      setSavingAnnotation(false);
    }
  };

  const handleGeneratePatch = async () => {
    setPatchLoading(true);
    try {
      const res = await api.post('/ai/generate-patch', { bugId: id });
      setGitPatch(res.data);
      if (res.data.source === 'claude') toast.success('AI patch generated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate patch');
    } finally {
      setPatchLoading(false);
    }
  };

  const handleExportToGithub = async (e) => {
    e.preventDefault();
    if (!repoOwner || !repoName) {
      toast.error('Repository owner and name are required');
      return;
    }
    setGithubLoading(true);
    try {
      const res = await api.post(`/bugs/${id}/github`, {
        repoOwner: repoOwner.trim(),
        repoName: repoName.trim(),
        githubToken: githubToken || undefined,
      });
      setBug((prev) => (prev ? { ...prev, githubIssue: res.data.githubIssue } : prev));
      toast.success('Successfully converted to GitHub Issue!');
      setShowGithubModal(false);
      setGithubToken('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export to GitHub');
    } finally {
      setGithubLoading(false);
    }
  };

  const handleGeneratePostMortem = async () => {
    setPostMortemLoading(true);
    try {
      const res = await api.post('/ai/post-mortem', { bugId: id });
      setPostMortem(res.data);
      toast.success(res.data.source === 'claude' ? 'Incident post-mortem generated' : 'Post-mortem template created');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate post-mortem');
    } finally {
      setPostMortemLoading(false);
    }
  };

  if (loading) return <BugDetailSkeleton />;
  if (!bug) {
    return (
      <div className="text-center py-20 text-muted space-y-3">
        <p>Bug not found</p>
        <Link to="/bugs" className="text-primary hover:underline text-sm">Back to all bugs</Link>
      </div>
    );
  }

  const canDelete = user?.role === 'admin';
  const canEdit = staff || bug.reporter?._id === user?._id;
  const hasScreenshot = bug.screenshot || bug.annotatedScreenshot;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="p-2 rounded-lg hover:bg-white/5 text-muted hover:text-text-base transition-colors duration-200"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <span>Bug Report</span>
            <span>•</span>
            <span>{formatDate(bug.createdAt)}</span>
          </div>
          <h1 className="text-xl font-bold text-text-base break-words">{bug.title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canEdit && (
            <button
              onClick={handleGeneratePatch}
              disabled={patchLoading}
              className="btn-secondary flex items-center gap-1.5 text-sm border-secondary/30 text-secondary hover:bg-secondary/10"
              title="Generate a code patch with Claude"
            >
              <GitPullRequest size={15} />
              {patchLoading ? 'Patching...' : 'AI PR Fix'}
            </button>
          )}
          {bug.githubIssue?.url ? (
            <a
              href={bug.githubIssue.url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary flex items-center gap-1.5 text-sm text-green-400 border-green-500/30 hover:bg-green-500/10"
            >
              <Github size={14} /> Issue #{bug.githubIssue.issueNumber} <ExternalLink size={12} />
            </a>
          ) : (
            staff && (
              <button
                onClick={() => setShowGithubModal(true)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
                title="Export bug to GitHub Issues"
              >
                <Github size={15} /> GitHub
              </button>
            )
          )}
          <button
            onClick={handleGeneratePostMortem}
            disabled={postMortemLoading}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Generate an incident post-mortem"
          >
            <FileText size={15} />
            {postMortemLoading ? 'Generating...' : 'Post-Mortem'}
          </button>
          {bug.errorLog && canEdit && (
            <button onClick={handleAnalyze} disabled={aiLoading} className="btn-secondary flex items-center gap-2 text-sm">
              <Cpu size={15} />
              {aiLoading ? 'Analyzing...' : 'AI Analyze'}
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => (isEditing ? setIsEditing(false) : openEditor())}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              {isEditing ? <X size={15} /> : <Edit3 size={15} />}
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
          )}
          {canDelete && (
            <button onClick={handleDelete} className="btn-danger flex items-center gap-2 text-sm">
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Occurrences & Telemetry Banner */}
      {(bug.occurrences > 1 || bug.source === 'sdk') && (
        <div className="glass-card p-4 border border-priority-high/30 bg-priority-high/5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-priority-high/15 border border-priority-high/30 flex items-center justify-center text-priority-high flex-shrink-0">
              <Zap size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-text-base text-sm">
                  {bug.occurrences > 1 ? 'Recurring Telemetry Incident' : 'Telemetry Incident'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-priority-high/20 text-priority-high border border-priority-high/30">
                  {bug.occurrences}x occurrences
                </span>
                {bug.source === 'sdk' && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Client SDK Ingested
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5">
                First detected {formatDate(bug.firstSeenAt || bug.createdAt)} • Last active {timeAgo(bug.lastSeenAt || bug.updatedAt)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edit panel */}
      {isEditing && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-text-base mb-4">Update Bug</h3>
          <form onSubmit={handleEditSubmit(handleEditSubmitFn)} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label" htmlFor="edit-status">Status</label>
              <select id="edit-status" {...regEdit('status')} className="input-field py-1.5 text-sm">
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="edit-priority">Priority</label>
              <select id="edit-priority" {...regEdit('priority')} className="input-field py-1.5 text-sm">
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {staff && (
              <div>
                <label className="label" htmlFor="edit-assignee">Assignee</label>
                <select id="edit-assignee" {...regEdit('assignedTo')} className="input-field py-1.5 text-sm min-w-[160px]">
                  <option value="">Unassigned</option>
                  {/* Keep the current assignee selectable while the list loads. */}
                  {bug.assignedTo && !assignees.some((a) => a._id === bug.assignedTo._id) && (
                    <option value={bug.assignedTo._id}>{bug.assignedTo.name}</option>
                  )}
                  {assignees.map((a) => (
                    <option key={a._id} value={a._id}>{a.name} ({a.role})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex-1 min-w-[180px]">
              <label className="label" htmlFor="edit-note">Status Note (optional)</label>
              <input id="edit-note" {...regEdit('statusNote')} maxLength={500} className="input-field py-1.5 text-sm" placeholder="Reason for change..." />
            </div>
            <button type="submit" className="btn-primary flex items-center gap-1.5 text-sm py-1.5">
              <Check size={14} /> Save Changes
            </button>
          </form>
        </div>
      )}

      {/* Annotation modal */}
      {showAnnotation && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Annotate screenshot">
          <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-primary" />
                <h3 className="text-sm font-semibold text-text-base">Annotate Screenshot</h3>
              </div>
              <button onClick={() => setShowAnnotation(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/5 text-muted hover:text-text-base transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {savingAnnotation ? (
                <div className="space-y-3">
                  <div className="skeleton h-9 w-2/3 rounded-lg" />
                  <div className="skeleton h-[360px] w-full rounded-xl" />
                </div>
              ) : (
                <AnnotationCanvas
                  imageUrl={getImageUrl(bug.screenshot || bug.annotatedScreenshot)}
                  onSave={handleSaveAnnotation}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5 min-w-0">
          {/* Description */}
          <div className="glass-card p-6">
            <div className="flex flex-wrap gap-2 mb-4">
              <StatusBadge status={bug.status} />
              <PriorityBadge priority={bug.priority} />
              <SeverityBadge severity={bug.severity} />
              {bug.project && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-secondary/10 text-secondary border border-secondary/20">
                  <Tag size={10} /> {bug.project}
                </span>
              )}
            </div>
            <div
              className="rich-text text-text-base text-sm leading-relaxed break-words"
              dangerouslySetInnerHTML={{ __html: safeDescription }}
            />
            {bug.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/5">
                {bug.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded text-xs bg-white/5 text-muted border border-border">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Steps */}
          {bug.steps?.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-text-base mb-3">Steps to Reproduce</h3>
              <ol className="space-y-2">
                {bug.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Error log */}
          {bug.errorLog && (
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-text-base">Error Log</h3>
              </div>
              <pre className="text-xs text-muted font-mono bg-black/20 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words max-h-96">
                {bug.errorLog}
              </pre>
            </div>
          )}

          {/* Flight Recorder Breadcrumbs */}
          {bug.breadcrumbs?.length > 0 && (
            <div className="glass-card p-6">
              <BreadcrumbTimeline breadcrumbs={bug.breadcrumbs} />
            </div>
          )}

          {/* Screenshot + annotation */}
          {hasScreenshot && (
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-base">
                  {bug.annotatedScreenshot ? 'Annotated Screenshot' : 'Screenshot'}
                </h3>
                {canEdit && (
                  <button
                    onClick={() => setShowAnnotation(true)}
                    className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
                  >
                    <Pencil size={13} /> Annotate
                  </button>
                )}
              </div>
              <img
                src={getImageUrl(bug.annotatedScreenshot || bug.screenshot)}
                alt="Bug screenshot"
                className="rounded-lg max-w-full border border-border"
              />
              {bug.annotatedScreenshot && bug.screenshot && (
                <p className="text-xs text-muted mt-2">
                  Showing annotated version.{' '}
                  <a
                    href={getImageUrl(bug.screenshot)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    View original
                  </a>
                </p>
              )}
            </div>
          )}

          {/* AI Insights */}
          {(aiLoading || bug.aiInsights?.possibleCause) && (
            <ErrorInsights
              insights={bug.aiInsights}
              analyzedAt={bug.aiInsights?.analyzedAt}
              isLoading={aiLoading}
            />
          )}

          {/* Comments */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={15} className="text-muted" />
              <h3 className="text-sm font-semibold text-text-base">Comments ({comments.length})</h3>
            </div>
            <div className="space-y-4 mb-5">
              {comments.map((comment) => (
                <div key={comment._id} className="flex gap-3 group">
                  <div className="mt-0.5">
                    <Avatar person={comment.author} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-text-base">{comment.author?.name}</span>
                      <span className="text-xs text-muted">{timeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap break-words">{comment.content}</p>
                  </div>
                  {(comment.author?._id === user?._id || user?.role === 'admin') && (
                    <button
                      onClick={() => handleDeleteComment(comment._id)}
                      aria-label="Delete comment"
                      className="p-1 rounded text-muted hover:text-priority-high hover:bg-priority-high/10 transition-colors md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-sm text-muted text-center py-4">No comments yet. Be the first!</p>
              )}
            </div>
            <form onSubmit={handleSubmit(handleAddComment)} className="flex gap-3">
              <div className="mt-1">
                <Avatar person={user} />
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  {...register('content', { required: true })}
                  maxLength={2000}
                  aria-label="Add a comment"
                  className="input-field flex-1 text-sm"
                  placeholder="Add a comment..."
                />
                <button
                  type="submit"
                  disabled={commentLoading}
                  aria-label="Post comment"
                  className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3 disabled:opacity-60"
                >
                  <Send size={14} className={commentLoading ? 'animate-pulse' : ''} />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar column */}
        <div className="space-y-4 min-w-0">
          {/* Reporter */}
          <div className="glass-card p-5">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Reporter</h3>
            {bug.reporter ? (
              <div className="flex items-center gap-3 min-w-0">
                <Avatar person={bug.reporter} size="w-10 h-10" text="text-sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-base truncate">{bug.reporter.name}</p>
                  <p className="text-xs text-muted truncate">{bug.reporter.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{bug.source === 'sdk' ? 'BugSense SDK' : 'Unknown'}</p>
            )}
          </div>

          {/* Assigned to */}
          <div className="glass-card p-5">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Assigned To</h3>
            {bug.assignedTo ? (
              <div className="flex items-center gap-3 min-w-0">
                <Avatar person={bug.assignedTo} size="w-10 h-10" text="text-sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-base truncate">{bug.assignedTo.name}</p>
                  <p className="text-xs text-muted truncate">{bug.assignedTo.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted flex items-center gap-2">
                <UserCheck size={14} /> Unassigned
              </p>
            )}
          </div>

          {/* Browser info */}
          {(bug.browserInfo?.os || bug.browserInfo?.browser) && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Monitor size={14} className="text-muted" />
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Browser Info</h3>
              </div>
              <div className="space-y-1.5 text-xs text-muted">
                {bug.browserInfo.browser && (
                  <p>Browser: <span className="text-text-base">{bug.browserInfo.browser} {bug.browserInfo.version}</span></p>
                )}
                {bug.browserInfo.os && <p>OS: <span className="text-text-base">{bug.browserInfo.os}</span></p>}
                {bug.browserInfo.screenSize && <p>Screen: <span className="text-text-base">{bug.browserInfo.screenSize}</span></p>}
                {bug.browserInfo.userAgent && (
                  <p className="truncate" title={bug.browserInfo.userAgent}>
                    UA: <span className="text-text-base">{bug.browserInfo.userAgent}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Status history timeline */}
          {bug.statusHistory?.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <History size={14} className="text-muted" />
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Status History</h3>
              </div>
              <div className="relative">
                <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-4">
                  {bug.statusHistory.map((entry, i) => {
                    const dotColor = STATUS_COLORS[entry.status]?.split(' ')[0] || 'text-muted';
                    return (
                      <div key={entry._id || i} className="flex gap-3 pl-6 relative">
                        <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-surface flex items-center justify-center bg-surface">
                          <div className={`w-2 h-2 rounded-full ${dotColor.replace('text-', 'bg-')}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-base capitalize">
                            {entry.status === 'in-progress' ? 'In Progress' : entry.status}
                          </p>
                          <p className="text-xs text-muted">
                            by {entry.changedBy?.name || (entry.changedBy ? 'a team member' : 'Telemetry pipeline')}
                          </p>
                          {entry.note && (
                            <p className="text-xs text-muted italic mt-0.5 break-words">&quot;{entry.note}&quot;</p>
                          )}
                          <p className="text-[10px] text-muted/60 mt-0.5">{timeAgo(entry.changedAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="glass-card p-5">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Timeline</h3>
            <div className="space-y-2 text-xs text-muted">
              <p>Created: <span className="text-text-base">{formatDate(bug.createdAt, 'MMM d, yyyy')}</span></p>
              <p>Updated: <span className="text-text-base">{formatDate(bug.updatedAt, 'MMM d, yyyy')}</span></p>
              {bug.aiInsights?.analyzedAt && (
                <p>Analyzed: <span className="text-primary">{formatDate(bug.aiInsights.analyzedAt, 'MMM d, yyyy')}</span></p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Git Patch Modal */}
      {gitPatch && (
        <GitPatchModal patch={gitPatch} onClose={() => setGitPatch(null)} />
      )}

      {/* GitHub Export Modal */}
      {showGithubModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Export to GitHub">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Github size={20} className="text-text-base" />
                <h3 className="font-semibold text-text-base text-sm">Export to GitHub Issue</h3>
              </div>
              <button onClick={() => setShowGithubModal(false)} aria-label="Close" className="text-muted hover:text-text-base">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-muted">
              Convert this bug report into a GitHub issue with reproduction steps, error logs, and diagnostics attached.
            </p>
            <form onSubmit={handleExportToGithub} className="space-y-3">
              <div>
                <label className="label text-xs" htmlFor="gh-owner">Repository Owner</label>
                <input
                  id="gh-owner"
                  value={repoOwner}
                  onChange={(e) => setRepoOwner(e.target.value)}
                  placeholder="e.g. facebook or your-username"
                  className="input-field text-sm"
                  pattern="[A-Za-z0-9][A-Za-z0-9\-]{0,38}"
                  required
                />
              </div>
              <div>
                <label className="label text-xs" htmlFor="gh-repo">Repository Name</label>
                <input
                  id="gh-repo"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="e.g. react or my-app"
                  className="input-field text-sm"
                  pattern="[A-Za-z0-9._\-]{1,100}"
                  required
                />
              </div>
              <div>
                <label className="label text-xs" htmlFor="gh-token">Personal Access Token (optional if set on server)</label>
                <input
                  id="gh-token"
                  type="password"
                  autoComplete="off"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="input-field text-sm font-mono"
                />
                <p className="text-[11px] text-muted mt-1">Sent once to the BugSense server for this request and not stored.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowGithubModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={githubLoading} className="btn-primary text-xs flex items-center gap-1.5">
                  {githubLoading ? 'Exporting...' : 'Create GitHub Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Incident Post-Mortem Modal */}
      {postMortem && (
        <PostMortemModal
          markdown={postMortem.markdown}
          source={postMortem.source}
          bugTitle={bug.title}
          onClose={() => setPostMortem(null)}
        />
      )}
    </div>
  );
}
