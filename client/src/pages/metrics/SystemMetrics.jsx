import React, { useEffect, useState } from 'react';
import { Activity, Database, Cpu, HardDrive, RefreshCw, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';

export default function SystemMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = async (showToast = false) => {
    try {
      setRefreshing(true);
      const res = await api.get('/health/metrics');
      setMetrics(res.data);
      if (showToast) toast.success('Metrics refreshed');
    } catch {
      toast.error('Failed to load system metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const timer = setInterval(() => fetchMetrics(), 10000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (seconds = 0) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        <RefreshCw size={24} className="animate-spin text-primary mr-2" />
        Loading system observability metrics...
      </div>
    );
  }

  const memPercent = metrics?.memory
    ? Math.min(100, Math.round((parseFloat(metrics.memory.heapUsedMb) / parseFloat(metrics.memory.heapTotalMb)) * 100))
    : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-text-base">System Vitals & Observability</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-green-500/15 text-green-400 border border-green-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Operational
            </span>
          </div>
          <p className="text-xs text-muted">
            Live telemetry ingestion metrics, MongoDB health, and Node.js process vitals. Auto-refreshes every 10s.
          </p>
        </div>
        <button
          onClick={() => fetchMetrics(true)}
          disabled={refreshing}
          className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh Now
        </button>
      </div>

      {/* Grid of 4 Vitals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Database Health */}
        <div className="glass-card p-5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Database Layer</span>
            <div className="w-7 h-7 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center">
              <Database size={15} />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-text-base font-mono capitalize">
              {metrics?.database?.status || 'Connected'}
            </div>
            <p className="text-[11px] text-muted font-mono mt-0.5 truncate">
              {metrics?.database?.name} @ {metrics?.database?.host}
            </p>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center gap-1 text-[11px] text-green-400">
            <CheckCircle2 size={12} /> Read/Write Operations Active
          </div>
        </div>

        {/* Card 2: Deduplication Efficiency */}
        <div className="glass-card p-5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Storage Efficiency</span>
            <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Zap size={15} />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-text-base font-mono">
              {metrics?.telemetry?.savingsPercentage || '0%'}
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              DB savings via auto-deduplication
            </p>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-muted font-mono">
            <span>Filtered: {metrics?.telemetry?.deduplicatedEvents || 0}</span>
            <span>Raw: {metrics?.telemetry?.totalRawIncidents || 0}</span>
          </div>
        </div>

        {/* Card 3: Memory Usage */}
        <div className="glass-card p-5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Node.js Heap</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
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
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-purple-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${memPercent}%` }}
            />
          </div>
        </div>

        {/* Card 4: Process Uptime */}
        <div className="glass-card p-5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Server Uptime</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Activity size={15} />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-text-base font-mono">
              {formatUptime(metrics?.uptimeSeconds)}
            </div>
            <p className="text-[11px] text-muted mt-0.5 font-mono">
              Runtime: Node.js {metrics?.nodeVersion}
            </p>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center gap-1 text-[11px] text-amber-400">
            <ShieldCheck size={12} /> WebSocket Daemon Active
          </div>
        </div>
      </div>

      {/* Detailed Telemetry Breakdown Card */}
      <div className="glass-card p-6 border border-white/10 space-y-4">
        <h3 className="text-sm font-semibold text-text-base flex items-center gap-2">
          <HardDrive size={16} className="text-primary" /> Incident Telemetry Pipeline Analytics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-xs text-muted">Total Unique Bug Records</span>
            <div className="text-2xl font-bold text-text-base font-mono">
              {metrics?.telemetry?.totalUniqueBugs || 0}
            </div>
            <p className="text-[11px] text-muted">Persisted in MongoDB</p>
          </div>
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-xs text-muted">Total Raw Telemetry Ingested</span>
            <div className="text-2xl font-bold text-secondary font-mono">
              {metrics?.telemetry?.totalRawIncidents || 0}
            </div>
            <p className="text-[11px] text-muted">Events processed through pipeline</p>
          </div>
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-xs text-muted">SDK Ingested Incidents</span>
            <div className="text-2xl font-bold text-indigo-400 font-mono">
              {metrics?.telemetry?.sdkReportedBugs || 0}
            </div>
            <p className="text-[11px] text-muted">Reported via <code>bugsense.js</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}
