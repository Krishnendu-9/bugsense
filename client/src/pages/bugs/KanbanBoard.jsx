import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, List, MessageSquare, ArrowRight, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import { useSocketEvent } from '../../hooks/useSocket.js';
import { PriorityBadge, SeverityBadge } from '../../components/common/Badge.jsx';
import { timeAgo, truncate, stripHtml } from '../../utils/helpers.js';
import api from '../../api/axios.js';

const COLUMNS = [
  { id: 'open', label: 'Open', color: 'border-blue-500/30 bg-blue-500/5', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { id: 'in-progress', label: 'In Progress', color: 'border-amber-500/30 bg-amber-500/5', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { id: 'resolved', label: 'Resolved', color: 'border-green-500/30 bg-green-500/5', badge: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { id: 'closed', label: 'Closed', color: 'border-slate-500/30 bg-slate-500/5', badge: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
];

export default function KanbanBoard() {
  const { bugs: allBugs, setBugs, fetchBugs } = useBugs();
  const [draggingBugId, setDraggingBugId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);

  useEffect(() => {
    fetchBugs({ limit: 100 });
  }, [fetchBugs]);

  // Real-time socket sync
  useSocketEvent('bug:updated', (updatedBug) => {
    setBugs((prev) => prev.map((b) => (b._id === updatedBug._id ? { ...b, ...updatedBug } : b)));
  });

  useSocketEvent('bug:created', (newBug) => {
    setBugs((prev) => (prev.some((b) => b._id === newBug._id) ? prev : [newBug, ...prev]));
  });

  const handleStatusChange = async (bugId, newStatus) => {
    const targetBug = (allBugs || []).find((b) => b._id === bugId);
    if (!targetBug || targetBug.status === newStatus) return;

    // Optimistic UI update
    setBugs((prev) => prev.map((b) => (b._id === bugId ? { ...b, status: newStatus } : b)));

    const colConfig = COLUMNS.find((c) => c.id === newStatus);
    toast.success(`Moved to ${colConfig?.label || newStatus}`);

    try {
      await api.put(`/bugs/${bugId}`, { status: newStatus });
    } catch {
      toast.error('Failed to update status on server');
      // Revert on error
      fetchBugs({ limit: 100 });
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
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-primary/15 text-primary border border-primary/30">
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

      {/* Kanban Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start select-none">
        {COLUMNS.map((col) => {
          const colBugs = (allBugs || []).filter((b) => b.status === col.id);
          const isDropTarget = dragOverColId === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragEnter={(e) => handleDragOver(e, col.id)}
              onDragLeave={(e) => handleDragLeave(e, col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`glass-card p-3.5 flex flex-col min-h-[550px] max-h-[82vh] border transition-all duration-200 rounded-2xl ${
                isDropTarget
                  ? 'border-primary bg-primary/[0.08] shadow-[0_0_30px_rgba(99,102,241,0.25),inset_0_0_20px_rgba(99,102,241,0.12)] ring-2 ring-primary/50'
                  : 'border-white/[0.08]'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${col.badge}`}>
                    {col.label}
                  </span>
                  <span className="text-xs text-muted font-mono font-bold">
                    {colBugs.length}
                  </span>
                </div>
                {isDropTarget && (
                  <span className="text-[10px] font-mono text-primary font-semibold animate-pulse">
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

                  return (
                    <div
                      key={bug._id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, bug._id)}
                      onDragEnd={handleDragEnd}
                      className={`p-3.5 rounded-xl bg-[#0B0F19]/90 border transition-all space-y-2.5 group cursor-grab active:cursor-grabbing ${
                        isBeingDragged
                          ? 'opacity-40 scale-95 border-dashed border-primary/80 shadow-none'
                          : 'border-white/[0.08] hover:border-primary/50 hover:bg-white/[0.04] hover:-translate-y-0.5 hover:shadow-lg'
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
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            SDK
                          </span>
                        )}
                      </div>

                      {/* Card Footer & Quick Move Controls */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-muted">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <MessageSquare size={11} /> {bug.comments?.length || 0}
                          </span>
                          <span>{timeAgo(bug.createdAt)}</span>
                        </div>

                        {/* Quick Shift Status Controls (Accessible fallback) */}
                        <div className="flex items-center gap-1">
                          {col.id !== 'open' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const prevIdx = COLUMNS.findIndex((c) => c.id === col.id) - 1;
                                if (prevIdx >= 0) handleStatusChange(bug._id, COLUMNS[prevIdx].id);
                              }}
                              title="Move back"
                              className="p-1 rounded hover:bg-white/10 text-muted hover:text-text-base transition-colors"
                            >
                              <ArrowLeft size={11} />
                            </button>
                          )}
                          {col.id !== 'closed' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextIdx = COLUMNS.findIndex((c) => c.id === col.id) + 1;
                                if (nextIdx < COLUMNS.length) handleStatusChange(bug._id, COLUMNS[nextIdx].id);
                              }}
                              title="Advance status"
                              className="p-1 rounded hover:bg-white/10 text-muted hover:text-text-base transition-colors"
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
                  <div className="text-center py-16 text-xs text-muted/40 font-mono flex flex-col items-center justify-center gap-2">
                    <span className="w-8 h-8 rounded-full border border-dashed border-white/10 flex items-center justify-center text-muted/30">
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
    </div>
  );
}
