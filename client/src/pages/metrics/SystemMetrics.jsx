import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Database, Cpu, HardDrive, RefreshCw, CheckCircle2, ShieldCheck, Zap, AlertTriangle } from 'lucide-react';
import useSocket from '../../hooks/useSocket.js';
import { StatsCardSkeleton } from '../../components/common/Loader.jsx';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';

export default function SystemMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { connected } = useSocket();
  // The background poll reports failures once (inline), not with a toast every 10s.
  const failedRef = useRef(false);

  // Returns the request; state is only set in its callbacks, once it settles,
  // so starting a poll never triggers a synchronous re-render.
  const fetchMetrics = useCallback((manual = false) =>
    api.get('/health/metrics')
      .then((res) => {
        setMetrics(res.data);
        setError(null);
        failedRef.current = false;
        if (manual) toast.success('Metrics refreshed');
      })
      .catch((err) => {
        const message = err.response?.data?.message || 'Failed to load system metrics';
        setError(message);
        if (manual || !failedRef.current) toast.error(message);
        failedRef.current = true;
      })
      .finally(() => setLoading(false)), []);

  const refreshNow = async () => {
    setRefreshing(true);
    await fetchMetrics(true);
    setRefreshing(false);
  };

  useEffect(() => {
    // Polling a hidden tab only generates load; refresh when it is shown again.
    const poll = () => {
      if (!document.hidden) fetchMetrics();
    };
    const first = setTimeout(poll, 0);
    const timer = setInterval(poll, 10000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [fetchMetrics]);

  const formatUptime = (seconds = 0) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl">
        <div className="skeleton h-8 w-72 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)}
        </div>
        <div className="skeleton h-40 w-full rounded-xl" />
      </div>
    );
  }

  const dbConnected = metrics?.database?.status === 'connected';
  const operational = !error && metrics?.status === 'operational';

  const memPercent = metrics?.memory
    ? Math.min(100, Math.round((parseFloat(metrics.memory.heapUsedMb) / parseFloat(metrics.memory.heapTotalMb)) * 100))
    : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-text-base">System Vitals</h1>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1 ${
                operational
                  ? 'bg-status-resolved/15 text-status-resolved border-status-resolved/30'
                  : 'bg-status-progress/15 text-status-progress border-status-progress/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${operational ? 'bg-status-resolved animate-pulse' : 'bg-status-progress'}`} />
              {error ? 'Unreachable' : operational ? 'Operational' : 'Degraded'}
            </span>
          </div>
          <p className="text-xs text-muted">
            Live telemetry ingestion metrics, MongoDB health, and Node.js process vitals. Auto-refreshes every 10s.
          </p>
        </div>
        <button
          onClick={refreshNow}
          disabled={refreshing}
          className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-pulse' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>

      {error && (
        <div className="glass-card p-4 border border-status-progress/30 bg-status-progress/5 flex items-center gap-2 text-sm text-status-progress">
          <AlertTriangle size={16} /> {error}{metrics ? ' — showing the last successful reading.' : ''}
        </div>
      )}

      {/* Grid of 4 Vitals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Database Health */}
        <div className="glass-card p-5 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Database Layer</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${dbConnected ? 'bg-status-resolved/15 text-status-resolved' : 'bg-status-progress/15 text-status-progress'}`}>
              <Database size={15} />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-text-base capitalize">
              {metrics?.database?.status || 'Unknown'}
            </div>
            <p className="text-[11px] text-muted font-mono mt-0.5 truncate">
              {metrics?.database?.name} @ {metrics?.database?.host}
            </p>
          </div>
          <div className={`pt-2 border-t border-hairline flex items-center gap-1 text-[11px] ${dbConnected ? 'text-status-resolved' : 'text-status-progress'}`}>
            {dbConnected ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {dbConnected ? 'Accepting reads and writes' : 'Database not connected'}
          </div>
        </div>

        {/* Card 2: Deduplication Efficiency */}
        <div className="glass-card p-5 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">SDK Deduplication</span>
            <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Zap size={15} />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-text-base font-mono">
              {/* null means no SDK crash has been received yet, which is not
                  the same claim as a 0% rate. */}
              {metrics?.telemetry?.dedupRate == null ? '—' : `${metrics.telemetry.dedupRate}%`}
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              {metrics?.telemetry?.dedupRate == null
                ? 'No SDK crashes received yet'
                : 'of SDK crashes merged into an existing incident'}
            </p>
          </div>
          <div className="pt-2 border-t border-hairline flex items-center justify-between text-[11px] text-muted font-mono">
            <span>Merged: {metrics?.telemetry?.duplicatesMerged || 0}</span>
            <span>Received: {metrics?.telemetry?.sdkCrashesReceived || 0}</span>
          </div>
        </div>

        {/* Card 3: Memory Usage */}
        <div className="glass-card p-5 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Node.js Heap</span>
            <div className="w-7 h-7 rounded-lg bg-track text-muted flex items-center justify-center">
              <Cpu size={15} />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-text-base font-mono">
              {metrics?.memory?.heapUsedMb} MB
            </div>
            <p className="text-[11px] text-muted mt-0.5 font-mono">
              of {metrics?.memory?.heapTotalMb} MB allocated ({memPercent}%)
            </p>
          </div>
          <div className="w-full bg-track rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-accent h-full rounded-full transition-all duration-500"
              style={{ width: `${memPercent}%` }}
            />
          </div>
        </div>

        {/* Card 4: Process Uptime */}
        <div className="glass-card p-5 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Server Uptime</span>
            <div className="w-7 h-7 rounded-lg bg-track text-muted flex items-center justify-center">
              <Activity size={15} />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-text-base font-mono">
              {formatUptime(metrics?.uptimeSeconds)}
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              Runtime: Node.js {metrics?.nodeVersion}
            </p>
          </div>
          <div className={`pt-2 border-t border-hairline flex items-center gap-1 text-[11px] ${connected ? 'text-status-resolved' : 'text-muted'}`}>
            <ShieldCheck size={12} /> {connected ? 'Your live connection is active' : 'Live connection offline'}
          </div>
        </div>
      </div>

      {/* Detailed Telemetry Breakdown Card */}
      <div className="glass-card p-6 border border-border space-y-4">
        <h3 className="text-sm font-semibold text-text-base flex items-center gap-2">
          <HardDrive size={16} className="text-primary" /> Incident Telemetry Pipeline Analytics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-track border border-hairline space-y-1">
            <span className="text-xs text-muted">SDK Crashes Received</span>
            <div className="text-2xl font-bold text-text-base font-mono">
              {metrics?.telemetry?.sdkCrashesReceived || 0}
            </div>
            <p className="text-[11px] text-muted">Every report sent by <code>bugsense.js</code></p>
          </div>
          <div className="p-4 rounded-xl bg-track border border-hairline space-y-1">
            <span className="text-xs text-muted">Incidents After Grouping</span>
            <div className="text-2xl font-bold text-accent font-mono">
              {metrics?.telemetry?.sdkIncidents || 0}
            </div>
            <p className="text-[11px] text-muted">One per distinct fingerprint</p>
          </div>
          <div className="p-4 rounded-xl bg-track border border-hairline space-y-1">
            <span className="text-xs text-muted">Duplicates Merged</span>
            <div className="text-2xl font-bold text-text-base font-mono">
              {metrics?.telemetry?.duplicatesMerged || 0}
            </div>
            <p className="text-[11px] text-muted">Received minus incidents</p>
          </div>
        </div>
      </div>
    </div>
  );
}
