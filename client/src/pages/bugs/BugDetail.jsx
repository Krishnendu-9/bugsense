import { lazy, Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Edit3, Tag, AlertTriangle, Cpu, X, GitMerge,
  GitPullRequest, ExternalLink, Github, FileText, FileEdit, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import useAI from '../../hooks/useAI.js';
import useAuth from '../../hooks/useAuth.js';
import useSocket, { useSocketEvent } from '../../hooks/useSocket.js';
import { PriorityText, SeverityText, StatusMark } from '../../components/common/Badge.jsx';
import ErrorInsights from '../../components/ai/ErrorInsights.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import OverflowMenu from '../../components/common/OverflowMenu.jsx';
import BreadcrumbTimeline from '../../components/bugs/BreadcrumbTimeline.jsx';
import BugComments from '../../components/bugs/BugComments.jsx';
import BugSidebar from '../../components/bugs/BugSidebar.jsx';
import CrashSummary from '../../components/bugs/CrashSummary.jsx';
import ScreenshotCard from '../../components/bugs/ScreenshotCard.jsx';
import TriagePanel from '../../components/bugs/TriagePanel.jsx';
import GitPatchModal from '../../components/ai/GitPatchModal.jsx';
import PostMortemModal from '../../components/ai/PostMortemModal.jsx';
import GitHubExportModal from '../../components/bugs/GitHubExportModal.jsx';
import { BugDetailSkeleton } from '../../components/common/Loader.jsx';
import {
  timeAgo, formatDate, sanitizeHtml, isStaff, isBugReporter, statusOptionsFor, stripHtml,
} from '../../utils/helpers.js';
import api from '../../api/axios.js';

// Quill is large and only needed once the edit dialog opens.
const EditBugModal = lazy(() => import('../../components/bugs/EditBugModal.jsx'));

// How long to wait for a background analysis before refetching once and
// letting the user run it manually.
const ANALYSIS_WAIT_MS = 30000;

// An SDK crash with no description is now stored with an empty one, and an
// empty description renders nothing. Records created before that change hold
// this placeholder instead (it was the server's old default); matching it is
// a fallback for those records only, not the mechanism.
const SDK_PLACEHOLDER_DESCRIPTION = 'Crash reported automatically by the BugSense SDK.';

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
  const { bug, setBug, loading, fetchBugById, updateBug, deleteBug } = useBugs();
  const { loading: aiLoading, analyze } = useAI();
  const [isEditing, setIsEditing] = useState(false);
  const [gitPatch, setGitPatch] = useState(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [postMortem, setPostMortem] = useState(null);
  const [postMortemLoading, setPostMortemLoading] = useState(false);

  const staff = isStaff(user);

  // A page opened from a link or a new tab has no in-app history to go back
  // to; Back would leave BugSense, so it goes to the bug list instead.
  const goBack = () => (location.key === 'default' ? navigate('/bugs') : navigate(-1));

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

  const handleAnalyze = async () => {
    if (!bug?.errorLog) { toast.error('No error log to analyze'); return; }
    // The server analyses the bug's stored log; these arguments only matter
    // for a one-off analysis with no bug.
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

  const handleTriageSave = async (data) => {
    try {
      await updateBug(id, data);
      toast.success('Bug updated');
      setIsEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update bug');
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

  const sdk = bug.source === 'sdk';
  const showCrashBanner = sdk || bug.occurrences > 1;
  // Empty -> no description card. The placeholder check covers older records.
  const descriptionText = stripHtml(bug.description || '').trim();
  const hasDescription = Boolean(descriptionText) && !(sdk && descriptionText === SDK_PLACEHOLDER_DESCRIPTION);
  // Populated by the API as { _id, title, status }; a bare id from an older
  // payload still gets a link.
  const mergedInto = bug.mergedInto && (typeof bug.mergedInto === 'object' ? bug.mergedInto : { _id: bug.mergedInto });

  return (
    <div className="space-y-5">
      {/* Header: title with the triage actions beside it, then one meta row
          (status, priority, severity, project, dates). */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-start gap-3">
          <button
            onClick={goBack}
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
                onClick={() => setIsEditing((open) => !open)}
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
                // A paid model call, so the same people as analysis and patches.
                canEdit && {
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

      {/* Closed by the fingerprint migration as a duplicate of another bug,
          which holds its occurrences from then on. */}
      {mergedInto && (
        <section aria-label="Merged" className="glass-card px-4 py-3 flex items-start gap-2 text-sm text-muted">
          <GitMerge size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p>
            Merged into{' '}
            <Link to={`/bugs/${mergedInto._id}`} className="text-accent hover:underline font-medium">
              {mergedInto.title ? `“${mergedInto.title}”` : 'another bug'}
            </Link>{' '}
            as the same crash. New occurrences are counted there.
          </p>
        </section>
      )}

      {showCrashBanner && <CrashSummary bug={bug} />}

      {isEditing && (
        <TriagePanel bug={bug} staff={staff} allowedStatuses={allowedStatuses} onSave={handleTriageSave} />
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

          {bug.breadcrumbs?.length > 0 && (
            <div className="glass-card p-6">
              <BreadcrumbTimeline breadcrumbs={bug.breadcrumbs} />
            </div>
          )}

          <ScreenshotCard
            bug={bug}
            canEdit={canEdit}
            onChange={(fields) => setBug((prev) => (prev ? { ...prev, ...fields } : prev))}
          />

          <BugComments bugId={id} user={user} />
        </div>

        <BugSidebar bug={bug} />
      </div>

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

      {showGithubModal && (
        <GitHubExportModal
          bugId={id}
          onClose={() => setShowGithubModal(false)}
          onExported={handleGithubExported}
        />
      )}

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
