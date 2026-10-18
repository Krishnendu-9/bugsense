import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, List, MessageSquare, ArrowRight, ArrowLeft, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import { useSocketEvent } from '../../hooks/useSocket.js';
import useAuth from '../../hooks/useAuth.js';
import { PriorityBadge, SeverityBadge } from '../../components/common/Badge.jsx';
import { timeAgo, truncate, stripHtml, isStaff, statusOptionsFor } from '../../utils/helpers.js';
import api from '../../api/axios.js';

// The board shows at most one API page; beyond that it links to the list view.
const BOARD_LIMIT = 100;

const COLUMNS = [
  { id: 'open', label: 'Open', color: 'border-status-open/30 bg-status-open/5', badge: 'bg-status-open/15 text-status-open border-status-open/30' },
  { id: 'in-progress', label: 'In Progress', color: 'border-status-progress/30 bg-status-progress/5', badge: 'bg-status-progress/15 text-status-progress border-status-progress/30' },
  { id: 'resolved', label: 'Resolved', color: 'border-status-resolved/30 bg-status-resolved/5', badge: 'bg-status-resolved/15 text-status-resolved border-status-resolved/30' },
  { id: 'closed', label: 'Closed', color: 'border-border bg-track', badge: 'bg-track text-muted border-border' },
];

export default function KanbanBoard() {
  const { user } = useAuth();
  const { bugs: allBugs, setBugs, fetchBugs, loading, pagination } = useBugs();
  const [initialized, setInitialized] = useState(false);
  const [draggingBugId, setDraggingBugId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);

  useEffect(() => {
    fetchBugs({ limit: BOARD_LIMIT }).finally(() => setInitialized(true));
  }, [fetchBugs]);

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

  return (
    <div className="space-y-6">
      {/* Header with View Toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-text-base">Issue Workflow Board</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-primary/15 text-primary border border-primary/30">
              Drag & Drop Enabled
            </span>
          </div>
          <p className="text-xs text-muted">
            Drag incident cards across columns to advance workflow status in real time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/bugs"
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            <List size={14} /> Table View
          </Link>
          <button className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-default">
            <LayoutGrid size={14} /> Kanban Board
          </button>
        </div>
      </div>

      {pagination.total > BOARD_LIMIT && (
        <div className="glass-card p-3 flex items-center gap-2 text-xs text-muted">
          <Info size={14} className="text-primary flex-shrink-0" />
          Showing the {BOARD_LIMIT} most recent of {pagination.total} bugs.{' '}
          <Link to="/bugs" className="text-primary hover:underline">Use the list view</Link> to see the rest.
        </div>
      )}

      {/* Kanban Columns Grid */}
      {!initialized && loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="glass-card p-3.5 space-y-3 min-h-[300px]">
              <div className="skeleton h-6 w-24 rounded-full" />
              <div className="skeleton h-24 w-full rounded-xl" />
              <div className="skeleton h-24 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start select-none">
        {COLUMNS.map((col, colIndex) => {
          const colBugs = (allBugs || []).filter((b) => b.status === col.id);
          const isDropTarget = dragOverColId === col.id;
          const prevColumn = COLUMNS[colIndex - 1];
          const nextColumn = COLUMNS[colIndex + 1];

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragEnter={(e) => handleDragOver(e, col.id)}
              onDragLeave={(e) => handleDragLeave(e, col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`glass-card p-3.5 flex flex-col min-h-[550px] max-h-[82vh] border transition-all duration-200 rounded-2xl ${
                isDropTarget
                  ? 'border-accent bg-accent-dim ring-2 ring-accent/40'
                  : 'border-border'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-hairline">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${col.badge}`}>
                    {col.label}
                  </span>
                  <span className="text-xs text-muted font-mono font-bold">
                    {colBugs.length}
                  </span>
                </div>
                {isDropTarget && (
                  <span className="text-[10px] text-primary font-semibold animate-pulse">
                    Drop to update
                  </span>
                )}
              </div>

              {/* Cards Container */}
              <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                {/* Drop indicator if hovering */}
                {isDropTarget && (
                  <div className="p-3 rounded-xl border-2 border-dashed border-primary/60 bg-primary/10 text-center text-xs text-primary font-semibold animate-in fade-in zoom-in-95 duration-150">
                    Release to move to {col.label}
                  </div>
                )}

                {colBugs.map((bug) => {
                  const isBeingDragged = draggingBugId === bug._id;
                  const movable = canMove(bug);

                  return (
                    <div
                      key={bug._id}
                      draggable={movable}
                      onDragStart={(e) => handleDragStart(e, bug._id)}
                      onDragEnd={handleDragEnd}
                      className={`p-3.5 rounded-xl bg-surface border transition-all space-y-2.5 group ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${
                        isBeingDragged
                          ? 'opacity-40 scale-95 border-dashed border-primary/80 shadow-none'
                          : 'border-border hover:border-primary/50 hover:bg-track hover:-translate-y-0.5 hover:shadow-lg'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/bugs/${bug._id}`}
                          onClick={(e) => isBeingDragged && e.preventDefault()}
                          className="text-xs font-semibold text-text-base group-hover:text-primary transition-colors line-clamp-2 flex-1"
                        >
                          {bug.title}
                        </Link>
                        <PriorityBadge priority={bug.priority} />
                      </div>

                      <p className="text-[11px] text-muted line-clamp-2 leading-relaxed">
                        {truncate(stripHtml(bug.description), 90)}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={bug.severity} />
                        {bug.occurrences > 1 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-priority-high/15 text-priority-high border border-priority-high/30">
                            ⚡ {bug.occurrences}x
                          </span>
                        )}
                        {bug.source === 'sdk' && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-track text-muted border border-border">
                            SDK
                          </span>
                        )}
                      </div>

                      {/* Card Footer & Quick Move Controls */}
                      <div className="flex items-center justify-between pt-2 border-t border-hairline text-[11px] text-muted">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <MessageSquare size={11} /> {bug.comments?.length || 0}
                          </span>
                          <span>{timeAgo(bug.createdAt)}</span>
                        </div>

                        {/* Quick Shift Status Controls (Accessible fallback) */}
                        <div className="flex items-center gap-1">
                          {prevColumn && canMoveTo(bug, prevColumn.id) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(bug._id, prevColumn.id);
                              }}
                              title="Move back"
                              aria-label={`Move "${bug.title}" back`}
                              className="p-1 rounded hover:bg-track text-muted hover:text-text-base transition-colors"
                            >
                              <ArrowLeft size={11} />
                            </button>
                          )}
                          {nextColumn && canMoveTo(bug, nextColumn.id) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(bug._id, nextColumn.id);
                              }}
                              title="Advance status"
                              aria-label={`Advance "${bug.title}"`}
                              className="p-1 rounded hover:bg-track text-muted hover:text-text-base transition-colors"
                            >
                              <ArrowRight size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colBugs.length === 0 && !isDropTarget && (
                  <div className="text-center py-16 text-xs text-muted/40 flex flex-col items-center justify-center gap-2">
                    <span className="w-8 h-8 rounded-full border border-dashed border-border flex items-center justify-center text-muted/30">
                      +
                    </span>
                    <span>No tickets in this stage</span>
                    <span className="text-[10px] text-muted/30">Drop card here</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
