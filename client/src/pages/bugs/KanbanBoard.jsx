import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSocketEvent } from '../../hooks/useSocket.js';
import useAuth from '../../hooks/useAuth.js';
import { OccurrenceBadge, PriorityText, StatusMark } from '../../components/common/Badge.jsx';
import ViewSwitch from '../../components/bugs/ViewSwitch.jsx';
import OverflowMenu from '../../components/common/OverflowMenu.jsx';
import { compactAgo, formatDate, isStaff, statusOptionsFor } from '../../utils/helpers.js';
import api from '../../api/axios.js';

// Each column is its own request for at most one API page of that status, so
// a pile of recently closed bugs can never push older open ones off the
// board. A column with more links to the list view, filtered to it.
const COLUMN_LIMIT = 100;

// Column headers use StatusMark, so a column and a table row name a status
// the same way; the label here is only for toasts and button labels.
const COLUMNS = [
  { id: 'open', label: 'Open' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/*
 * The card's muted line: severity, priority, source, project, age.
 *
 * The board is the triage surface, so it shows severity where the tables
 * don't -- but only Blocker, in colour, by the same rule as priority: the
 * urgent end gets colour and the rest stays quiet. (A blocker alerts the team
 * whatever its priority, so a low-priority blocker must not look ordinary.)
 * SDK is spelled out only for a single report; from two upwards the
 * occurrence badge beside the title already says it.
 *
 * Only the project name gives way when the line is too long (ellipsis, full
 * name on hover); severity, priority and age always render whole.
 */
function CardContext({ bug }) {
  const fixed = 'flex-shrink-0 whitespace-nowrap';
  const parts = [];
  if (bug.severity === 'blocker') {
    parts.push(<span key="sev" className={`${fixed} text-priority-critical font-medium`}>Blocker</span>);
  }
  // Medium weight for High as well as Critical: at card text size the hue
  // alone doesn't register, so both urgent priorities carry weight and the
  // hue tells them apart. (The table's larger text doesn't need this.)
  parts.push(
    <span key="pri" className={`${fixed} ${bug.priority === 'high' ? 'font-medium' : ''}`}>
      <PriorityText priority={bug.priority} />
    </span>
  );
  if (bug.source === 'sdk' && !(bug.occurrences > 1)) parts.push(<span key="src" className={fixed}>SDK</span>);
  if (bug.project) {
    parts.push(
      <span key="proj" className="min-w-0 truncate" title={bug.project}>
        {bug.project}
      </span>
    );
  }
  parts.push(
    <span key="age" className={fixed} title={formatDate(bug.createdAt, 'MMM d, yyyy HH:mm')}>
      {compactAgo(bug.createdAt)}
    </span>
  );
  return parts.reduce(
    (acc, part, i) =>
      i === 0
        ? [part]
        : [...acc, <span key={`sep${i}`} className="flex-shrink-0 whitespace-pre" aria-hidden="true"> · </span>, part],
    []
  );
}

export default function KanbanBoard() {
  const { user } = useAuth();
  const [allBugs, setBugs] = useState([]);
  // How many bugs each status has in all, from its request: more than the
  // column shows means the column was cut at COLUMN_LIMIT.
  const [totals, setTotals] = useState({});
  const [ready, setReady] = useState(false);
  const [draggingBugId, setDraggingBugId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(COLUMNS.map((col) => api.get(`/bugs?status=${col.id}&limit=${COLUMN_LIMIT}`)))
      .then((responses) => {
        if (cancelled) return;
        setBugs(responses.flatMap((res) => res.data.bugs));
        setTotals(Object.fromEntries(COLUMNS.map((col, i) => [col.id, responses[i].data.total])));
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.response?.data?.message || 'Failed to load the board');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Staff move any bug anywhere; a reporter may only close their own bug or
  // reopen it. The API enforces the same rule.
  const canMoveTo = (bug, status) => statusOptionsFor(user, bug).includes(status);
  const canMove = (bug) => statusOptionsFor(user, bug).some((status) => status !== bug.status);

  // Real-time socket sync
  useSocketEvent('bug:updated', (updatedBug) => {
    setBugs((prev) => prev.map((b) => (b._id === updatedBug._id ? { ...b, ...updatedBug } : b)));
  });

  useSocketEvent('bug:created', (newBug) => {
    setBugs((prev) => (prev.some((b) => b._id === newBug._id) ? prev : [newBug, ...prev]));
  });

  useSocketEvent('bug:deleted', ({ _id }) => {
    setBugs((prev) => prev.filter((b) => b._id !== _id));
  });

  const handleStatusChange = async (bugId, newStatus) => {
    const targetBug = (allBugs || []).find((b) => b._id === bugId);
    if (!targetBug || targetBug.status === newStatus) return;
    if (!canMoveTo(targetBug, newStatus)) {
      toast.error(
        isStaff(user) || !canMove(targetBug)
          ? 'Only developers, admins or the reporter can move this bug'
          : 'Reporters can only close their bug or reopen it'
      );
      return;
    }

    const previousStatus = targetBug.status;
    // Optimistic UI update
    setBugs((prev) => prev.map((b) => (b._id === bugId ? { ...b, status: newStatus } : b)));

    try {
      await api.put(`/bugs/${bugId}`, { status: newStatus });
      const colConfig = COLUMNS.find((c) => c.id === newStatus);
      toast.success(`Moved to ${colConfig?.label || newStatus}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
      setBugs((prev) => prev.map((b) => (b._id === bugId ? { ...b, status: previousStatus } : b)));
    }
  };

  // Drag Handlers
  const handleDragStart = (e, bugId) => {
    e.dataTransfer.setData('text/plain', bugId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingBugId(bugId);
  };

  const handleDragEnd = () => {
    setDraggingBugId(null);
    setDragOverColId(null);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDragLeave = (e, colId) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      if (dragOverColId === colId) {
        setDragOverColId(null);
      }
    }
  };

  const handleDrop = (e, colId) => {
    e.preventDefault();
    setDragOverColId(null);
    const bugId = e.dataTransfer.getData('text/plain') || draggingBugId;
    if (bugId) {
      handleStatusChange(bugId, colId);
    }
    setDraggingBugId(null);
  };

  // One quiet line, said once: how to move a card. The Move menu works on
  // every device; dragging is the desktop shortcut (touch browsers mostly do
  // not start an HTML drag), so it is mentioned second.
  let hint = null;
  if (isStaff(user)) hint = 'Use a card’s Move menu, or drag it, to change its status.';
  else if (user) hint = 'You can move your own bugs to Closed, or back to Open.';

  const shown = allBugs.length;
  const truncated = COLUMNS.filter((col) => (totals[col.id] || 0) > COLUMN_LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Board</h1>
          <p className="mt-1 text-sm text-muted">
            {ready ? [plural(shown, 'bug'), hint].filter(Boolean).join(' · ') : ' '}
          </p>
        </div>
        <ViewSwitch current="board" />
      </div>

      {ready && truncated.length > 0 && (
        <div className="glass-card p-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <Info size={14} className="text-accent flex-shrink-0" aria-hidden="true" />
          {truncated.map((col, i) => (
            <span key={col.id}>
              {i > 0 && '· '}
              {col.label} shows the {COLUMN_LIMIT} most recent of {totals[col.id]}.{' '}
              <Link to={`/bugs?status=${col.id}`} className="text-accent hover:underline">See them all</Link>
            </span>
          ))}
        </div>
      )}

      {!ready ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="glass-card min-h-[300px]">
              <div className="px-4 py-3 border-b border-border">
                <div className="skeleton h-4 w-24 rounded" />
              </div>
              <div className="p-2 space-y-2">
                <div className="skeleton h-16 w-full rounded-lg" />
                <div className="skeleton h-16 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start select-none">
        {COLUMNS.map((col) => {
          const colBugs = (allBugs || []).filter((b) => b.status === col.id);
          const isDropTarget = dragOverColId === col.id;

          return (
            <section
              key={col.id}
              aria-label={`${col.label}, ${plural(colBugs.length, 'bug')}`}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragEnter={(e) => handleDragOver(e, col.id)}
              onDragLeave={(e) => handleDragLeave(e, col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`glass-card flex flex-col min-h-[550px] max-h-[82vh] transition-colors duration-200 ${
                isDropTarget ? '!border-accent ring-1 ring-accent/40' : ''
              }`}
            >
              {/* Column header: the status and its count, nothing else */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border text-sm">
                <StatusMark status={col.id} />
                <span className="font-mono tabular-nums text-muted">{colBugs.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {colBugs.map((bug) => {
                  const isBeingDragged = draggingBugId === bug._id;
                  const movable = canMove(bug);

                  return (
                    <div
                      key={bug._id}
                      draggable={movable}
                      onDragStart={(e) => handleDragStart(e, bug._id)}
                      onDragEnd={handleDragEnd}
                      className={`group rounded-lg border bg-surface px-3 py-2.5 transition-colors duration-200 ${
                        movable ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${isBeingDragged ? 'opacity-40 border-dashed border-accent' : 'border-border hover:border-subtle/50 hover:bg-track'}`}
                    >
                      <div className="flex items-start gap-2">
                        <Link
                          to={`/bugs/${bug._id}`}
                          onClick={(e) => isBeingDragged && e.preventDefault()}
                          className="flex-1 min-w-0 text-sm text-fg line-clamp-2 hover:text-accent transition-colors focus:outline-none focus-visible:underline"
                        >
                          {bug.title}
                        </Link>
                        <span className="mt-0.5 flex">
                          <OccurrenceBadge bug={bug} />
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                        <div className="flex flex-1 min-w-0 text-muted">
                          <CardContext bug={bug} />
                        </div>

                        {/* Move: one menu of the statuses this card can go to, on
                            every width -- the way to move without dragging (touch,
                            keyboard), with no direction to get wrong. The negative
                            margins give it a thumb-sized target without making the
                            card taller. */}
                        <span className="flex-shrink-0 -my-2.5 -mr-2">
                          <OverflowMenu
                            label={`Move "${bug.title}"`}
                            triggerText="Move"
                            triggerClassName="inline-flex h-9 items-center rounded-lg px-2.5 text-xs text-muted hover:text-fg hover:bg-track transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            items={COLUMNS.filter((c) => c.id !== bug.status && canMoveTo(bug, c.id)).map((c) => ({
                              key: c.id,
                              label: c.label,
                              onClick: () => handleStatusChange(bug._id, c.id),
                            }))}
                          />
                        </span>
                      </div>
                    </div>
                  );
                })}

                {colBugs.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-subtle">No bugs</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      )}
    </div>
  );
}
