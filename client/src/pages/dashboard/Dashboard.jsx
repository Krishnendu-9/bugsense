import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import useBugs from '../../hooks/useBugs.js';
import useAuth from '../../hooks/useAuth.js';
import StatsCard, { StatsCardSkeleton } from '../../components/dashboard/StatsCard.jsx';
import TrendStrip from '../../components/dashboard/TrendStrip.jsx';
import { PriorityBars, StatusDonut } from '../../components/dashboard/BugChart.jsx';
import DedupCard from '../../components/dashboard/DedupCard.jsx';
import RecentBugs from '../../components/dashboard/RecentBugs.jsx';
import { formatDate, formatDuration, formatStatDuration, isStaff } from '../../utils/helpers.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/*
 * Every figure on this page comes from one of three endpoints, and each is
 * loaded independently: if one fails, its cards say so and the rest still
 * render. A missing number is shown as a dash with the reason beside it,
 * never as a zero.
 *
 *   /bugs/stats          snapshot: counts, priorities, projects, recent
 *   /bugs/stats/trends   history: open per day, time to resolve, resolved this week
 *   /health/metrics      SDK deduplication (staff only)
 */
export default function Dashboard() {
  const { fetchStats, fetchTrends } = useBugs();
  const { user } = useAuth();
  const staff = isStaff(user);

  // undefined = loading, null = failed, object = loaded
  const [stats, setStats] = useState(undefined);
  const [trends, setTrends] = useState(undefined);
  const [telemetry, setTelemetry] = useState(undefined);
  const [loadedAt, setLoadedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchStats(),
      fetchTrends(),
      staff ? api.get('/health/metrics').then((r) => r.data.telemetry) : Promise.resolve(null),
    ]).then(([s, t, m]) => {
      if (cancelled) return;
      setStats(s.status === 'fulfilled' ? s.value : null);
      setTrends(t.status === 'fulfilled' ? t.value : null);
      setTelemetry(m.status === 'fulfilled' ? m.value : null);
      setLoadedAt(new Date());
    });
    return () => {
      cancelled = true;
    };
  }, [fetchStats, fetchTrends, staff]);

  const statsLoading = stats === undefined;
  const trendsLoading = trends === undefined;

  // Header context line.
  let context;
  if (statsLoading) context = null;
  else if (!stats) context = 'Could not load statistics.';
  else
    context = `${plural(stats.total, 'bug')} · ${plural(stats.projects, 'project')} · updated ${formatDate(
      loadedAt,
      'HH:mm'
    )}`;

  // Open: age of the longest-waiting open bug.
  let openCaption;
  if (!stats) openCaption = 'Could not load statistics.';
  else if (stats.oldestOpenAt) openCaption = `oldest ${formatDuration(loadedAt - new Date(stats.oldestOpenAt))}`;
  else openCaption = 'No open bugs.';

  // Median time to resolve.
  const ttr = trends?.timeToResolve;
  let medianCaption;
  if (!trends) medianCaption = 'Could not load bug history.';
  else if (ttr.sampleSize === 0) medianCaption = 'No bug has been resolved yet.';
  else medianCaption = `across ${plural(ttr.sampleSize, 'resolved bug')}`;

  const statusCounts = stats && {
    open: stats.open,
    'in-progress': stats.inProgress,
    resolved: stats.resolved,
    closed: stats.closed,
  };

  let dedupState;
  if (!staff) dedupState = { kind: 'restricted' };
  else if (telemetry === undefined) dedupState = { kind: 'loading' };
  else if (telemetry === null) dedupState = { kind: 'error' };
  else dedupState = { kind: 'ready', telemetry };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Overview</h1>
        {context === null ? (
          <div className="skeleton mt-2 h-4 w-64 rounded" />
        ) : (
          <p className="mt-1 text-sm text-muted">{context}</p>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statsLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : (
          <>
            <StatsCard label="Total" value={stats?.total} caption={stats ? 'All time' : 'Could not load statistics.'} to="/bugs" />
            <StatsCard label="Open" value={stats?.open} caption={openCaption} to="/bugs?status=open" />
          </>
        )}
        {trendsLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : (
          <>
            <StatsCard
              label="Median time to resolve"
              value={ttr ? formatStatDuration(ttr.medianMs) : null}
              caption={medianCaption}
            />
            <StatsCard
              label="Resolved"
              value={trends?.resolvedInWindow.count}
              caption={trends ? 'last 7 days' : 'Could not load bug history.'}
            />
          </>
        )}
      </div>

      <TrendStrip days={trends?.openByDay.days ?? null} loading={trendsLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PriorityBars byPriority={stats ? stats.byPriority : null} loading={statsLoading} />
        <StatusDonut counts={statusCounts} loading={statsLoading} />
        <DedupCard state={dedupState} />
      </div>

      <RecentBugs bugs={stats ? stats.recent : null} loading={statsLoading} />
    </div>
  );
}
