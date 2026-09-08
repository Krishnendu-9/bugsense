import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bug, CheckCircle2, Clock, AlertCircle, Activity, Sparkles, Terminal, LayoutGrid, ArrowRight, ShieldCheck } from 'lucide-react';
import useBugs from '../../hooks/useBugs.js';
import useAuth from '../../hooks/useAuth.js';
import StatsCard from '../../components/dashboard/StatsCard.jsx';
import { PriorityBarChart, StatusPieChart } from '../../components/dashboard/BugChart.jsx';
import RecentBugs from '../../components/dashboard/RecentBugs.jsx';
import { StatsCardSkeleton } from '../../components/common/Loader.jsx';

export default function Dashboard() {
  const { fetchStats } = useBugs();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats()
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchStats]);

  const statusData = stats
    ? { open: stats.open, 'in-progress': stats.inProgress, resolved: stats.resolved, closed: stats.closed }
    : {};

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="glass-card p-6 relative overflow-hidden border border-white/[0.08]">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-primary/20 via-secondary/15 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start justify-between gap-6 flex-wrap relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-primary/20 text-primary border border-primary/30 flex items-center gap-1.5">
                <Sparkles size={12} className="text-secondary" /> Enterprise Incident Hub
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck size={12} /> Pipeline 100% Operational
              </span>
            </div>
            <h1 className="text-2xl font-bold text-text-base tracking-tight mb-1">
              Welcome back, <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">{user?.name || 'Engineer'}</span>
            </h1>
            <p className="text-xs text-muted max-w-2xl leading-relaxed">
              Real-time telemetry, automated stack trace deduplication, and AI diagnostic fix generation across your applications.
            </p>
          </div>

          {/* Quick Launch Shortcuts */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              to="/sdk-demo"
              className="px-3.5 py-2 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 hover:border-primary/40 text-xs font-semibold text-text-base flex items-center gap-2 transition-all group"
            >
              <Terminal size={14} className="text-primary group-hover:scale-110 transition-transform" />
              <span>SDK Sandbox</span>
            </Link>
            <Link
              to="/board"
              className="px-3.5 py-2 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 hover:border-primary/40 text-xs font-semibold text-text-base flex items-center gap-2 transition-all group"
            >
              <LayoutGrid size={14} className="text-secondary group-hover:scale-110 transition-transform" />
              <span>Kanban Board</span>
            </Link>
            <Link
              to="/report"
              className="btn-primary text-xs flex items-center gap-1.5 py-2 px-3.5 shadow-glow-primary"
            >
              <span>Report Bug</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)
        ) : (
          <>
            <StatsCard
              title="Total Bugs"
              value={stats?.total}
              icon={Bug}
              color="text-primary"
              subtitle="All time"
              to="/bugs"
            />
            <StatsCard
              title="Open"
              value={stats?.open}
              icon={AlertCircle}
              color="text-status-open"
              subtitle="Needs attention"
              to="/bugs?status=open"
            />
            <StatsCard
              title="In Progress"
              value={stats?.inProgress}
              icon={Clock}
              color="text-status-in-progress"
              subtitle="Being worked on"
              to="/bugs?status=in-progress"
            />
            <StatsCard
              title="Resolved"
              value={stats?.resolved}
              icon={CheckCircle2}
              color="text-status-resolved"
              subtitle="Fixed"
              to="/bugs?status=resolved"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <PriorityBarChart data={stats?.byPriority || []} />
        </div>
        <div>
          <StatusPieChart data={statusData} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <RecentBugs bugs={stats?.recent || []} />
        </div>
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-muted" />
            <h3 className="text-sm font-semibold text-text-base">Quick Stats</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Closed bugs', value: stats?.closed ?? 0, color: 'text-status-closed' },
              { label: 'Critical priority', value: stats?.byPriority?.find((p) => p._id === 'critical')?.count ?? 0, color: 'text-priority-critical' },
              { label: 'High priority', value: stats?.byPriority?.find((p) => p._id === 'high')?.count ?? 0, color: 'text-priority-high' },
              { label: 'Low priority', value: stats?.byPriority?.find((p) => p._id === 'low')?.count ?? 0, color: 'text-priority-low' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted">{label}</span>
                <span className={`text-sm font-semibold ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
