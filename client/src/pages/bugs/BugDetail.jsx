import { lazy, Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Trash2, Edit3, MessageSquare, Send, Monitor,
  Tag, AlertTriangle, Cpu, X, Check, Pencil, History,
  GitPullRequest, ExternalLink, Github, Zap, FileText, UserCheck, FileEdit, Copy, RotateCcw, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import useAI from '../../hooks/useAI.js';
import useAuth from '../../hooks/useAuth.js';
import useSocket, { useSocketEvent } from '../../hooks/useSocket.js';
import { PriorityText, SeverityText, StatusMark } from '../../components/common/Badge.jsx';
import ErrorInsights from '../../components/ai/ErrorInsights.jsx';
import Modal from '../../components/common/Modal.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import OverflowMenu from '../../components/common/OverflowMenu.jsx';
import BreadcrumbTimeline from '../../components/bugs/BreadcrumbTimeline.jsx';
import GitPatchModal from '../../components/ai/GitPatchModal.jsx';
import PostMortemModal from '../../components/ai/PostMortemModal.jsx';
import GitHubExportModal from '../../components/bugs/GitHubExportModal.jsx';
import { BugDetailSkeleton } from '../../components/common/Loader.jsx';
import {
  timeAgo, getInitials, formatDate, getImageUrl, sanitizeHtml, isStaff, dataUrlToFile,
  isBugReporter, statusOptionsFor, stripHtml, findRegressions,
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

// An SDK crash with no description is now stored with an empty one, and an
// empty description renders nothing. Records created before that change hold
// this placeholder instead (it was the server's old default); matching it is
// a fallback for those records only, not the mechanism.
const SDK_PLACEHOLDER_DESCRIPTION = 'Crash reported automatically by the BugSense SDK.';

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
  const [commentToDelete, setCommentToDelete] = useState(null);
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
              toast(`Status changed to "${updatedBug.status}" by ${who}`, { icon: <RefreshCw size={16} className="text-muted" aria-hidden="true" /> });
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
            toast(`New comment from ${newComment.author?.name || 'team member'}`, { icon: <MessageSquare size={16} className="text-muted" aria-hidden="true" /> });
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
        // Deleted elsewhere while we were asking whether to delete it.
        setCommentToDelete((pending) => (pending?._id === _id ? null : pending));
      },
      [id]
    )
  );

  useSocketEvent(
    'bug:deleted',
    useCallback(
      ({ _id }) => {
        if (_id !== id) return;
        toast('This bug was deleted', { icon: <Trash2 size={16} className="text-muted" aria-hidden="true" /> });
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

  // Runs from the confirmation dialog only. On failure the dialog stays open
  // (with the error toast) so the person can retry or cancel.
  const handleDeleteComment = async () => {
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
        <Link to="/bugs" className="text-accent hover:underline text-sm">Back to all bugs</Link>
      </div>
    );
  }

  const canDelete = user?.role === 'admin';
  const canEdit = staff || isBugReporter(user, bug);
  const allowedStatuses = statusOptionsFor(user, bug);
  const hasScreenshot = bug.screenshot || bug.annotatedScreenshot;

  const sdk = bug.source === 'sdk';
  const showCrashBanner = sdk || bug.occurrences > 1;
  const regressions = findRegressions(bug.statusHistory);
  const lastRegression = regressions.at(-1);
  // Empty -> no description card. The placeholder check covers older records.
  const descriptionText = stripHtml(bug.description || '').trim();
  const hasDescription = Boolean(descriptionText) && !(sdk && descriptionText === SDK_PLACEHOLDER_DESCRIPTION);

  const copyFingerprint = async () => {
    try {
      // Absent outside secure contexts; the throw lands in the catch.
      await navigator.clipboard.writeText(bug.fingerprint);
      toast.success('Fingerprint copied');
    } catch {
      toast.error('Could not copy the fingerprint');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header: title with the triage actions beside it, then one meta row
          (status, priority, severity, project, dates). */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="p-2 rounded-lg hover:bg-track text-muted hover:text-fg transition-colors duration-200 flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="flex-1 min-w-[16rem] pt-1 text-xl font-bold text-fg break-words">{bug.title}</h1>

          {/* Inline: what triage itself uses -- Triage (status, priority,
              owner) and AI Analyze (the cause, when there is none yet), plus
              the GitHub issue link once one exists, since that is state. The
              rest happens after triage, rarely, or destroys the bug. */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {bug.githubIssue?.url && (
              <a
                href={bug.githubIssue.url}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary flex items-center gap-1.5 text-sm text-status-resolved border-status-resolved/30 hover:bg-status-resolved/10"
              >
                <Github size={14} /> Issue #{bug.githubIssue.issueNumber} <ExternalLink size={12} />
              </a>
            )}
            {bug.errorLog && canEdit && (
              <button onClick={handleAnalyze} disabled={aiLoading} className="btn-secondary flex items-center gap-2 text-sm">
                <Cpu size={15} />
                {aiLoading ? 'Analyzing...' : 'AI Analyze'}
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
            <OverflowMenu
              label="More actions"
              items={[
                canEdit && {
                  key: 'patch',
                  label: patchLoading && !gitPatch ? 'Patching...' : bug.gitPatch?.diff ? 'View AI patch' : 'AI PR fix',
                  icon: GitPullRequest,
                  onClick: handleOpenPatch,
                  disabled: patchLoading,
                },
                staff && !bug.githubIssue?.url && {
                  key: 'github',
                  label: 'Export to GitHub',
                  icon: Github,
                  onClick: () => setShowGithubModal(true),
                },
                {
                  key: 'postmortem',
                  label: postMortemLoading ? 'Generating...' : 'Post-mortem',
                  icon: FileText,
                  onClick: handleGeneratePostMortem,
                  disabled: postMortemLoading,
                },
                canEdit && {
                  key: 'edit',
                  label: 'Edit details',
                  icon: FileEdit,
                  onClick: () => setShowEditDetails(true),
                },
                canDelete && {
                  key: 'delete',
                  label: 'Delete bug',
                  icon: Trash2,
                  onClick: () => setConfirmingDelete(true),
                  danger: true,
                },
              ]}
            />
          </div>
        </div>

        {/* The same marks as the tables and the Board: a status square, and
            priority and severity as text, coloured only at the urgent end
            (critical/high, blocker). Labelled, since outside a table "High"
            and "Major" alone don't say which is which. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:pl-12 text-sm text-subtle">
          <StatusMark status={bug.status} />
          <span aria-hidden="true">·</span>
          <span>Priority <PriorityText priority={bug.priority} /></span>
          <span aria-hidden="true">·</span>
          <span>Severity <SeverityText severity={bug.severity} /></span>
          {bug.project && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-muted">
                <Tag size={12} aria-hidden="true" /> {bug.project}
              </span>
            </>
          )}
          {/* An SDK bug's first crash is in the banner; a person's report says
              when it was filed. "Updated" is any change at all -- an edit, a
              status move, a comment or a new crash report -- so it can be later
              than the last crash, and both are shown. */}
          {!showCrashBanner && (
            <>
              <span aria-hidden="true">·</span>
              <span>Reported {formatDate(bug.createdAt)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span title={`Last change of any kind (edit, status, comment or crash report): ${formatDate(bug.updatedAt, 'MMM d, yyyy HH:mm')}`}>
            Updated {timeAgo(bug.updatedAt)}
          </span>
        </div>
      </header>

      {/* Crash summary: count, first and last crash, regression, fingerprint.
          A neutral surface: an SDK crash is not urgent by being one. Only the
          regression line carries colour. */}
      {showCrashBanner && (
        <section aria-label="Crash summary" className="glass-card px-4 py-3 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="flex items-center gap-2 font-semibold text-fg">
              <Zap size={16} className="text-muted" aria-hidden="true" />
              <span><span className="font-mono">{bug.occurrences || 1}</span> {(bug.occurrences || 1) === 1 ? 'occurrence' : 'occurrences'}</span>
            </span>
            <span className="text-muted">
              First crash <span className="text-fg">{formatDate(bug.firstSeenAt || bug.createdAt)}</span>
            </span>
            <span className="text-muted" title={`When the SDK last reported this crash: ${formatDate(bug.lastSeenAt || bug.updatedAt, 'MMM d, yyyy HH:mm')}`}>
              Last crash <span className="text-fg">{timeAgo(bug.lastSeenAt || bug.updatedAt)}</span>
            </span>
            {sdk && <span className="text-muted">Reported by the SDK</span>}
            {bug.fingerprint && (
              <button
                type="button"
                onClick={copyFingerprint}
                title={`Fingerprint ${bug.fingerprint} (click to copy)`}
                aria-label={`Copy fingerprint ${bug.fingerprint}`}
                className="sm:ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-0.5 text-xs text-muted hover:text-fg hover:bg-track transition-colors"
              >
                Fingerprint <span className="font-mono text-fg">{bug.fingerprint.slice(0, 8)}</span>
                <Copy size={12} aria-hidden="true" />
              </button>
            )}
          </div>
          {lastRegression && (
            <p className="flex items-start gap-2 text-sm font-semibold text-danger">
              <RotateCcw size={15} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>
                Regressed {timeAgo(lastRegression.at)}: it crashed again after being{' '}
                {lastRegression.previous
                  ? `${lastRegression.previous.status}${lastRegression.previous.changedBy?.name ? ` by ${lastRegression.previous.changedBy.name}` : ''} on ${formatDate(lastRegression.previous.changedAt)}`
                  : 'resolved'}
                .
                {regressions.length > 1 && (
                  <span className="font-normal text-muted"> {regressions.length} regressions in total.</span>
                )}
              </span>
            </p>
          )}
        </section>
      )}

      {/* Edit panel */}
      {isEditing && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-fg mb-1">{staff ? 'Triage' : 'Update Status'}</h3>
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* Main column: the report (description, steps), then the debugging
            core (error, analysis), then reference (breadcrumbs, screenshot,
            discussion). An SDK crash has no report, so it opens on the error. */}
        <div className="space-y-5 min-w-0">
          {/* Description -- omitted when there is none, or only the SDK's placeholder */}
          {(hasDescription || bug.tags?.length > 0) && (
            <div className="glass-card p-6">
              {hasDescription && (
                <div
                  className="rich-text text-fg text-sm leading-relaxed break-words"
                  dangerouslySetInnerHTML={{ __html: safeDescription }}
                />
              )}
              {bug.tags?.length > 0 && (
                <div className={`flex flex-wrap gap-1.5 ${hasDescription ? 'mt-4 pt-4 border-t border-hairline' : ''}`}>
                  {bug.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded text-xs bg-track text-muted border border-border">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Steps */}
          {bug.steps?.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-fg mb-3">Steps to Reproduce</h3>
              <ol className="space-y-2">
                {bug.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-track text-muted text-xs flex items-center justify-center font-medium mt-0.5">
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
                <h3 className="text-sm font-semibold text-fg">Error Log</h3>
              </div>
              <pre className="text-xs text-muted font-mono bg-track p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words max-h-96">
                {bug.errorLog}
              </pre>
            </div>
          )}

          {/* AI Insights -- straight after the error it explains */}
          {(aiLoading || analysisPending || bug.aiInsights?.possibleCause) && (
            <ErrorInsights
              insights={bug.aiInsights}
              analyzedAt={bug.aiInsights?.analyzedAt}
              isLoading={aiLoading || analysisPending}
            />
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
                <h3 className="text-sm font-semibold text-fg">
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
                    className="text-accent hover:underline"
                  >
                    View original
                  </a>
                </p>
              )}
            </div>
          )}

          {/* Comments */}
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
                      visible (no hover on touch); asks before deleting. The
                      negative margins keep the 40px target from adding height. */}
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

        {/* Sidebar column: owner first (a triage fact), then reference */}
        <div className="space-y-4 min-w-0">
          {/* Assigned to */}
          <div className="glass-card p-5">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Assigned To</h3>
            {bug.assignedTo ? (
              <div className="flex items-center gap-3 min-w-0">
                <Avatar person={bug.assignedTo} size="w-10 h-10" text="text-sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{bug.assignedTo.name}</p>
                  <p className="text-xs text-muted truncate">{bug.assignedTo.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted flex items-center gap-2">
                <UserCheck size={14} /> Unassigned
              </p>
            )}
          </div>

          {/* Reporter -- not for SDK crashes: the banner already says the SDK reported it */}
          {!(sdk && !bug.reporter) && (
            <div className="glass-card p-5">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Reporter</h3>
              {bug.reporter ? (
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar person={bug.reporter} size="w-10 h-10" text="text-sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg truncate">{bug.reporter.name}</p>
                    <p className="text-xs text-muted truncate">{bug.reporter.email}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Unknown</p>
              )}
            </div>
          )}

          {/* Browser info */}
          {(bug.browserInfo?.os || bug.browserInfo?.browser) && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Monitor size={14} className="text-muted" />
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Browser Info</h3>
              </div>
              <div className="space-y-1.5 text-xs text-muted">
                {bug.browserInfo.browser && (
                  <p>Browser: <span className="text-fg">{bug.browserInfo.browser} {bug.browserInfo.version}</span></p>
                )}
                {bug.browserInfo.os && <p>OS: <span className="text-fg">{bug.browserInfo.os}</span></p>}
                {bug.browserInfo.screenSize && <p>Screen: <span className="text-fg">{bug.browserInfo.screenSize}</span></p>}
                {bug.browserInfo.userAgent && (
                  <p className="truncate" title={bug.browserInfo.userAgent}>
                    UA: <span className="text-fg">{bug.browserInfo.userAgent}</span>
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
                          <p className="text-xs font-medium text-fg capitalize">
                            {entry.status === 'in-progress' ? 'In Progress' : entry.status}
                          </p>
                          <p className="text-xs text-muted">
                            by {entry.changedBy?.name || (entry.changedBy ? 'a team member' : 'Telemetry pipeline')}
                          </p>
                          {entry.note && (
                            <p className="text-xs text-muted italic mt-0.5 break-words">&quot;{entry.note}&quot;</p>
                          )}
                          <p className="text-[10px] text-subtle mt-0.5">{timeAgo(entry.changedAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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

      {commentToDelete && (
        <ConfirmDialog
          title="Delete this comment?"
          message={`${commentToDelete.author?._id === user?._id ? 'Your comment' : `${commentToDelete.author?.name || 'This person'}'s comment`} will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete comment"
          danger
          onConfirm={handleDeleteComment}
          onCancel={() => setCommentToDelete(null)}
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
