import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, Clock, RefreshCw, AlertTriangle, Bug, Terminal, Github, CheckCircle2, Trash2,
  UserPlus, UserCog, KeyRound, LogIn, MessageSquare, MessageSquareX,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import { timeAgo } from '../../utils/helpers.js';

const ACTION_ICONS = {
  BUG_CREATED: { icon: Bug, color: 'text-accent bg-accent/15 border-accent/30' },
  BUG_UPDATED: { icon: CheckCircle2, color: 'text-accent bg-accent/15 border-accent/30' },
  SDK_TELEMETRY: { icon: Terminal, color: 'text-muted bg-track border-border' },
  // Typed into the SDK widget by a person, so it reads as a comment, not a crash.
  SDK_FEEDBACK: { icon: MessageSquare, color: 'text-muted bg-track border-border' },
  REGRESSION_DETECTED: { icon: AlertTriangle, color: 'text-priority-high bg-priority-high/15 border-priority-high/30' },
  GITHUB_EXPORTED: { icon: Github, color: 'text-status-resolved bg-status-resolved/15 border-status-resolved/30' },
  BUG_DELETED: { icon: Trash2, color: 'text-priority-high bg-priority-high/15 border-priority-high/30' },
  USER_REGISTERED: { icon: UserPlus, color: 'text-accent bg-accent/15 border-accent/30' },
  ROLE_CHANGED: { icon: UserCog, color: 'text-accent bg-accent/15 border-accent/30' },
  PASSWORD_CHANGED: { icon: KeyRound, color: 'text-status-progress bg-status-progress/15 border-status-progress/30' },
  LOGIN_FAILED: { icon: LogIn, color: 'text-priority-high bg-priority-high/15 border-priority-high/30' },
  COMMENT_ADDED: { icon: MessageSquare, color: 'text-accent bg-accent/15 border-accent/30' },
  COMMENT_DELETED: { icon: MessageSquareX, color: 'text-muted bg-track border-border' },
};

const TABS = [
  { id: '', label: 'All Events' },
  { id: 'bug', label: 'Bugs & Mutations' },
  { id: 'telemetry', label: 'SDK Telemetry' },
  { id: 'comment', label: 'Comments' },
  { id: 'user', label: 'Accounts' },
];

// Entries whose entityId is a bug, so they can link to it.
const BUG_LINKED_TYPES = ['bug', 'telemetry', 'comment'];

const PAGE_SIZE = 30;

function AuditSkeleton() {
  return (
    <div className="glass-card divide-y divide-hairline border border-border overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-4 flex items-start gap-3.5">
          <div className="skeleton w-8 h-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Bumped by the Refresh button to refetch the current page.
  const [reloadCount, setReloadCount] = useState(0);
  const manualRefresh = useRef(false);

  // State is only set once the request settles; the loading and refreshing
  // flags are raised by the handlers that trigger a fetch.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filterType) params.set('entityType', filterType);

    api.get(`/audit?${params}`)
      .then((res) => {
        if (cancelled) return;
        setLogs(res.data.logs || []);
        setTotal(res.data.total || 0);
        setPages(res.data.pages || 1);
        if (manualRefresh.current) toast.success('Audit trail refreshed');
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.response?.data?.message || 'Failed to load audit logs');
      })
      .finally(() => {
        if (cancelled) return;
        manualRefresh.current = false;
        setLoading(false);
        setRefreshing(false);
      });

    return () => { cancelled = true; };
  }, [page, filterType, reloadCount]);

  const refresh = () => {
    manualRefresh.current = true;
    setRefreshing(true);
    setReloadCount((n) => n + 1);
  };

  const selectFilter = (id) => {
    setFilterType(id);
    setPage(1);
    setLoading(true);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-fg">Audit log</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent border border-accent/30 flex items-center gap-1">
              <Shield size={12} /> Staff only
            </span>
          </div>
          <p className="text-xs text-muted">
            Chronological record of bug changes, telemetry, comments, account events and GitHub exports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-pulse' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-hairline pb-3 overflow-x-auto text-xs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={filterType === tab.id}
            onClick={() => selectFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
              filterType === tab.id
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-muted hover:text-fg hover:bg-track'
            }`}
          >
            {tab.label}
            {filterType === tab.id && ` (${total})`}
          </button>
        ))}
      </div>

      {/* Audit Log Timeline */}
      {loading ? (
        <AuditSkeleton />
      ) : logs.length === 0 ? (
        <div className="text-center py-20 text-muted text-xs space-y-2">
          <Shield size={32} className="mx-auto text-muted/40 mb-2" />
          <p>No audit records found.</p>
          <p className="text-[11px] text-muted/60">New developer actions and telemetry events will appear here.</p>
        </div>
      ) : (
        <div className="glass-card divide-y divide-hairline border border-border overflow-hidden">
          {logs.map((log) => {
            const config = ACTION_ICONS[log.action] || { icon: Shield, color: 'text-muted bg-track border-border' };
            const Icon = config.icon;
            const linksToBug = log.entityId && log.action !== 'BUG_DELETED' && BUG_LINKED_TYPES.includes(log.entityType);

            return (
              <div key={log._id} className="p-4 flex items-start gap-3.5 hover:bg-track transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 mt-0.5 ${config.color}`}>
                  <Icon size={15} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-fg break-words">
                      {log.details}
                    </span>
                    <span className="text-[10px] text-muted whitespace-nowrap flex items-center gap-1 font-mono">
                      <Clock size={10} /> {timeAgo(log.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted flex-wrap">
                    <span className="font-medium text-fg">
                      {log.performedBy?.name || log.performedByName}
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[10px] bg-track px-1.5 py-px rounded border border-hairline">
                      {log.action}
                    </span>
                    {linksToBug && (
                      <>
                        <span>•</span>
                        <Link to={`/bugs/${log.entityId}`} className="text-accent hover:underline">
                          View bug →
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted px-2">Page {page} of {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
