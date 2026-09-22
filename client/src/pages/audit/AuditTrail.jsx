import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Clock, RefreshCw, AlertTriangle, Bug, Terminal, Github, CheckCircle2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import { timeAgo } from '../../utils/helpers.js';

const ACTION_ICONS = {
  BUG_CREATED: { icon: Bug, color: 'text-primary bg-primary/15 border-primary/30' },
  BUG_UPDATED: { icon: CheckCircle2, color: 'text-secondary bg-secondary/15 border-secondary/30' },
  SDK_TELEMETRY: { icon: Terminal, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
  REGRESSION_DETECTED: { icon: AlertTriangle, color: 'text-priority-high bg-priority-high/15 border-priority-high/30' },
  GITHUB_EXPORTED: { icon: Github, color: 'text-green-400 bg-green-500/15 border-green-500/30' },
  BUG_DELETED: { icon: Trash2, color: 'text-priority-high bg-priority-high/15 border-priority-high/30' },
};

const PAGE_SIZE = 30;

function AuditSkeleton() {
  return (
    <div className="glass-card divide-y divide-white/5 border border-white/10 overflow-hidden">
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

  const fetchLogs = useCallback(async (manual = false) => {
    try {
      setRefreshing(true);
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filterType) params.set('entityType', filterType);
      const res = await api.get(`/audit?${params}`);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
      if (manual) toast.success('Audit trail refreshed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, filterType]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
            <h1 className="text-xl font-bold text-text-base">Audit Trail</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
              <Shield size={12} /> Staff only
            </span>
          </div>
          <p className="text-xs text-muted">
            Chronological record of bug changes, telemetry events and GitHub exports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-white/5 pb-3 overflow-x-auto text-xs" role="tablist">
        {[
          { id: '', label: 'All Events' },
          { id: 'bug', label: 'Bugs & Mutations' },
          { id: 'telemetry', label: 'SDK Telemetry' },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={filterType === tab.id}
            onClick={() => selectFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
              filterType === tab.id
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted hover:text-text-base hover:bg-white/5'
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
        <div className="glass-card divide-y divide-white/5 border border-white/10 overflow-hidden">
          {logs.map((log) => {
            const config = ACTION_ICONS[log.action] || { icon: Shield, color: 'text-muted bg-white/5 border-white/10' };
            const Icon = config.icon;
            const linksToBug = log.entityId && log.action !== 'BUG_DELETED' && ['bug', 'telemetry'].includes(log.entityType);

            return (
              <div key={log._id} className="p-4 flex items-start gap-3.5 hover:bg-white/[0.02] transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 mt-0.5 ${config.color}`}>
                  <Icon size={15} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-text-base break-words">
                      {log.details}
                    </span>
                    <span className="text-[10px] text-muted whitespace-nowrap flex items-center gap-1 font-mono">
                      <Clock size={10} /> {timeAgo(log.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted flex-wrap">
                    <span className="font-medium text-text-base">
                      {log.performedBy?.name || log.performedByName}
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[10px] bg-black/30 px-1.5 py-px rounded border border-white/5">
                      {log.action}
                    </span>
                    {linksToBug && (
                      <>
                        <span>•</span>
                        <Link to={`/bugs/${log.entityId}`} className="text-primary hover:underline">
                          View Incident →
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
