import { lazy, Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Trash2, Edit3, MessageSquare, Send, Monitor,
  Tag, AlertTriangle, Cpu, X, Check, Pencil, History,
  GitPullRequest, ExternalLink, Github, Zap, FileText, UserCheck, FileEdit,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import useAI from '../../hooks/useAI.js';
import useAuth from '../../hooks/useAuth.js';
import useSocket, { useSocketEvent } from '../../hooks/useSocket.js';
import { PriorityBadge, StatusBadge, SeverityBadge } from '../../components/common/Badge.jsx';
import ErrorInsights from '../../components/ai/ErrorInsights.jsx';
import Modal from '../../components/common/Modal.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import BreadcrumbTimeline from '../../components/bugs/BreadcrumbTimeline.jsx';
import GitPatchModal from '../../components/ai/GitPatchModal.jsx';
import PostMortemModal from '../../components/ai/PostMortemModal.jsx';
import GitHubExportModal from '../../components/bugs/GitHubExportModal.jsx';
import { BugDetailSkeleton } from '../../components/common/Loader.jsx';
import {
  timeAgo, getInitials, formatDate, getImageUrl, sanitizeHtml, isStaff, dataUrlToFile,
  isBugReporter, statusOptionsFor,
} from '../../utils/helpers.js';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, STATUS_MARK_COLORS } from '../../utils/constants.js';
import api from '../../api/axios.js';

function Avatar({ person, size = 'w-8 h-8', text = 'text-xs' }) {
  return (
    <div className={`${size} rounded-full bg-accent flex items-center justify-center text-on-accent ${text} font-bold flex-shrink-0 overflow-hidden`}>
      {person?.avatar ? (
        <img src={getImageUrl(person.avatar)} alt="" className="w-full h-full object-cover" />
      ) : (
        getInitials(person?.name)
      )}
    </div>
  );
}

// Fabric (annotation) and Quill (editing) are large and only needed once their
// dialogs open, so they load on demand.
const AnnotationCanvas = lazy(() => import('../../components/bugs/AnnotationCanvas.jsx'));
const EditBugModal = lazy(() => import('../../components/bugs/EditBugModal.jsx'));

// How long to wait for a background analysis before refetching once and
// letting the user run it manually.
const ANALYSIS_WAIT_MS = 30000;

function AnnotationSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading annotation tools">
      <div className="skeleton h-9 w-2/3 rounded-lg" />
      <div className="skeleton h-[360px] w-full rounded-xl" />
    </div>
  );
}

// One instance per bug: following a link from one bug to another remounts the
// page, so comments, open dialogs, the triage panel and any pending analysis
// never carry over from the previous bug.
export default function BugDetail() {
  const { id } = useParams();
  return <BugDetailView key={id} />;
}

function BugDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by ReportBug when the server started analysing the new bug's error log.
  const [pendingAnalysisId, setPendingAnalysisId] = useState(() => (location.state?.analysisPending ? id : null));
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
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [postMortem, setPostMortem] = useState(null);
  const [postMortemLoading, setPostMortemLoading] = useState(false);

  const { register, handleSubmit, reset } = useForm();
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit } = useForm();

  const staff = isStaff(user);

  useEffect(() => {
    fetchBugById(id);
  }, [id, fetchBugById]);

  // The pending flag is one-shot: drop it from history so a reload does not
  // show a spinner for an analysis that finished long ago.
  useEffect(() => {
    if (location.state?.analysisPending) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const analysisPending = pendingAnalysisId === id && !bug?.aiInsights?.possibleCause;

  useEffect(() => {
    if (!analysisPending) return undefined;
    const timer = setTimeout(() => {
      fetchBugById(id, { silent: true });
      setPendingAnalysisId(null);
    }, ANALYSIS_WAIT_MS);
    return () => clearTimeout(timer);
  }, [analysisPending, id, fetchBugById]);

  // Comments load once per bug; live additions and deletions arrive over the
  // socket, so they are not refetched every time the bug itself changes.
  // (Each bug id gets a fresh component instance, so they start empty.)
  useEffect(() => {
    let cancelled = false;
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
      statusNote: '',
      ...(staff ? { priority: bug.priority, assignedTo: bug.assignedTo?._id || '' } : {}),
    });
    setIsEditing(true);
  };

  const handleAnalyze = async () => {
    if (!bug?.errorLog) { toast.error('No error log to analyze'); return; }
    const result = await analyze(bug.errorLog, bug.description, bug._id);
    if (!result) return;
    setBug((prev) => (prev ? { ...prev, aiInsights: result } : prev));
    toast.success(result.source === 'claude' ? 'AI analysis complete' : 'Heuristic analysis complete (AI unavailable)');
  };

  const handleDelete = async () => {
    try {
      await deleteBug(id);
      toast.success('Bug deleted');
      navigate('/bugs');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete bug');
      setConfirmingDelete(false);
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

  const generatePatch = async () => {
    setPatchLoading(true);
    try {
      const res = await api.post('/ai/generate-patch', { bugId: id });
      setGitPatch(res.data);
      if (res.data.source === 'claude') {
        const { diff, explanation, generatedAt } = res.data;
        setBug((prev) => (prev ? { ...prev, gitPatch: { diff, explanation, generatedAt } } : prev));
        toast.success('AI patch generated');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate patch');
    } finally {
      setPatchLoading(false);
    }
  };

  // A patch is a paid model call, so a saved one is shown instead of
  // regenerating it; the dialog offers Regenerate explicitly.
  const handleOpenPatch = () => {
    if (bug.gitPatch?.diff) {
      setGitPatch({ ...bug.gitPatch, source: 'claude' });
      return;
    }
    generatePatch();
  };

  const handleGithubExported = (githubIssue) => {
    setBug((prev) => (prev ? { ...prev, githubIssue } : prev));
    setShowGithubModal(false);
  };

  const handleGeneratePostMortem = async () => {
    setPostMortemLoading(true);
    try {
      const res = await api.post('/ai/post-mortem', { bugId: id });
      setPostMortem(res.data);
      toast.success(res.data.source === 'claude' ? 'Post-mortem generated' : 'Post-mortem template created');
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
  const canEdit = staff || isBugReporter(user, bug);
  const allowedStatuses = statusOptionsFor(user, bug);
  const hasScreenshot = bug.screenshot || bug.annotatedScreenshot;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header: title on its own row so long titles use the full width, with
          the actions underneath. */}
      <div className="space-y-3">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="p-2 rounded-lg hover:bg-track text-muted hover:text-text-base transition-colors duration-200 flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted mb-1">
              <span>Bug Report</span>
              <span>•</span>
              <span>{formatDate(bug.createdAt)}</span>
            </div>
            <h1 className="text-xl font-bold text-text-base break-words">{bug.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:pl-14">
          {canEdit && (
            <button
              onClick={handleOpenPatch}
              disabled={patchLoading}
              className="btn-secondary flex items-center gap-1.5 text-sm border-secondary/30 text-secondary hover:bg-secondary/10"
              title={bug.gitPatch?.diff ? 'Show the saved AI patch' : 'Generate a code patch with Claude'}
            >
              <GitPullRequest size={15} />
              {patchLoading && !gitPatch ? 'Patching...' : bug.gitPatch?.diff ? 'View AI Patch' : 'AI PR Fix'}
            </button>
          )}
          {bug.githubIssue?.url ? (
            <a
              href={bug.githubIssue.url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary flex items-center gap-1.5 text-sm text-status-resolved border-status-resolved/30 hover:bg-status-resolved/10"
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
            title="Generate a post-mortem"
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
              onClick={() => setShowEditDetails(true)}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <FileEdit size={15} /> Edit Details
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => (isEditing ? setIsEditing(false) : openEditor())}
              aria-expanded={isEditing}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              {isEditing ? <X size={15} /> : <Edit3 size={15} />}
              {isEditing ? 'Cancel' : staff ? 'Triage' : 'Status'}
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmingDelete(true)} className="btn-danger flex items-center gap-2 text-sm">
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
                  {bug.occurrences > 1 ? 'Recurring crash' : 'Single crash'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-priority-high/20 text-priority-high border border-priority-high/30">
                  {bug.occurrences}x occurrences
                </span>
                {bug.source === 'sdk' && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-track text-muted border border-border">
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
          <h3 className="text-sm font-semibold text-text-base mb-1">{staff ? 'Triage' : 'Update Status'}</h3>
          {!staff && (
            <p className="text-xs text-muted mb-4">
              You can close your bug if it no longer happens, or reopen it if it came back. The team handles the rest of the workflow.
            </p>
          )}
          <form onSubmit={handleEditSubmit(handleEditSubmitFn)} className={`flex flex-wrap gap-3 items-end ${staff ? 'mt-3' : ''}`}>
            <div>
              <label className="label" htmlFor="edit-status">Status</label>
              <select id="edit-status" {...regEdit('status')} className="input-field py-1.5 text-sm">
                {STATUS_OPTIONS.filter((opt) => allowedStatuses.includes(opt.value)).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {staff && (
              <div>
                <label className="label" htmlFor="edit-priority">Priority</label>
                <select id="edit-priority" {...regEdit('priority')} className="input-field py-1.5 text-sm">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}
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
        <Modal
          title="Annotate Screenshot"
          icon={Pencil}
          onClose={() => setShowAnnotation(false)}
          size="2xl"
          closeDisabled={savingAnnotation}
        >
          {savingAnnotation ? (
            <AnnotationSkeleton />
          ) : (
            <Suspense fallback={<AnnotationSkeleton />}>
              <AnnotationCanvas
                imageUrl={getImageUrl(bug.screenshot || bug.annotatedScreenshot)}
                onSave={handleSaveAnnotation}
              />
            </Suspense>
          )}
        </Modal>
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
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-hairline">
                {bug.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded text-xs bg-track text-muted border border-border">
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
                <AlertTriangle size={15} className="text-muted" />
                <h3 className="text-sm font-semibold text-text-base">Error Log</h3>
              </div>
              <pre className="text-xs text-muted font-mono bg-track p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words max-h-96">
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
          {(aiLoading || analysisPending || bug.aiInsights?.possibleCause) && (
            <ErrorInsights
              insights={bug.aiInsights}
              analyzedAt={bug.aiInsights?.analyzedAt}
              isLoading={aiLoading || analysisPending}
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
                    // A static lookup on the mark tokens, shared with StatusMark.
                    const dotColor = STATUS_MARK_COLORS[entry.status] || 'bg-subtle';
                    return (
                      <div key={entry._id || i} className="flex gap-3 pl-6 relative">
                        <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-surface flex items-center justify-center bg-surface">
                          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
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
        <GitPatchModal
          patch={gitPatch}
          onClose={() => setGitPatch(null)}
          onRegenerate={canEdit ? generatePatch : undefined}
          regenerating={patchLoading}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this bug?"
          message={`"${bug.title}", its comments and screenshots will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete Bug"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {showEditDetails && (
        <Suspense fallback={null}>
          <EditBugModal
            bug={bug}
            onSave={(content) => updateBug(id, content)}
            onClose={() => setShowEditDetails(false)}
          />
        </Suspense>
      )}

      {/* GitHub Export Modal */}
      {showGithubModal && (
        <GitHubExportModal
          bugId={id}
          onClose={() => setShowGithubModal(false)}
          onExported={handleGithubExported}
        />
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
