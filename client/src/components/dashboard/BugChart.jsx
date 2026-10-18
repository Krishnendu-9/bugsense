import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { STATUS_CHART_TOKENS, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../utils/constants.js';
import { useThemeTokens } from '../../hooks/useTheme.js';

const CardSkeleton = () => (
  <div className="glass-card p-5 space-y-4">
    <div className="skeleton h-4 w-24 rounded" />
    <div className="skeleton h-36 w-full rounded" />
  </div>
);

// A failed load is said in words; an empty chart would read as "no bugs".
const Unavailable = ({ title }) => (
  <section className="glass-card p-5">
    <h2 className="text-sm font-semibold text-fg">{title}</h2>
    <p className="mt-5 text-sm text-subtle">Could not load statistics.</p>
  </section>
);

/**
 * Bugs per priority as horizontal bars, all in one colour: the row labels
 * already name the categories, so colour would only repeat them. Most severe
 * first, every priority shown, including those with no bugs.
 *
 * Each bar is that priority's share of all bugs, not its size relative to the
 * largest priority. Relative-to-largest draws equal counts as identical
 * full-width stripes, which stops reading as a chart; a share keeps the track
 * visible and means the same thing at any scale.
 *
 * `byPriority` is the API's [{ _id, count }] grouping, in no particular order,
 * or null when /stats failed -- which must not render as a row of zeros.
 */
export function PriorityBars({ byPriority, loading }) {
  if (loading) return <CardSkeleton />;
  if (!byPriority) return <Unavailable title="By priority" />;

  const counts = Object.fromEntries(byPriority.map((g) => [g._id, g.count]));
  const rows = [...PRIORITY_OPTIONS].reverse().map(({ value, label }) => ({
    value,
    label,
    count: counts[value] || 0,
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <section className="glass-card p-5" aria-labelledby="priority-heading">
      <h2 id="priority-heading" className="text-sm font-semibold text-fg">
        By priority
      </h2>
      <ul className="mt-5 space-y-3.5">
        {rows.map((row) => (
          <li key={row.value}>
            <Link
              to={`/bugs?priority=${row.value}`}
              className="group grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={`${row.label} priority: ${row.count} bugs`}
            >
              <span className="text-sm text-muted group-hover:text-fg transition-colors">{row.label}</span>
              <span className="h-2 rounded-full bg-track overflow-hidden">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${total ? (row.count / total) * 100 : 0}%` }}
                />
              </span>
              <span className="text-right text-sm font-mono tabular-nums text-fg">{row.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Bugs per status as a donut with a legend. Colours are the semantic status
 * tokens; Recharts takes them as props, so they are resolved through
 * useThemeTokens() and follow the theme.
 *
 * `counts` maps status value -> count, built from the /stats snapshot, or null
 * when it failed.
 */
export function StatusDonut({ counts, loading }) {
  const navigate = useNavigate();
  const tokens = useThemeTokens(Object.values(STATUS_CHART_TOKENS));

  if (loading) return <CardSkeleton />;
  if (!counts) return <Unavailable title="By status" />;

  const rows = STATUS_OPTIONS.map(({ value, label }) => ({
    value,
    label,
    count: counts[value] || 0,
    color: tokens[STATUS_CHART_TOKENS[value]],
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <section className="glass-card p-5" aria-labelledby="status-heading">
      <h2 id="status-heading" className="text-sm font-semibold text-fg">
        By status
      </h2>

      {total === 0 ? (
        <p className="mt-5 text-sm text-subtle">No bugs reported yet.</p>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          <div className="relative h-32 w-32 flex-shrink-0" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows.filter((r) => r.count > 0)}
                  dataKey="count"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                  onClick={(slice) => navigate(`/bugs?status=${slice.value}`)}
                  className="cursor-pointer"
                >
                  {rows
                    .filter((r) => r.count > 0)
                    .map((r) => (
                      <Cell key={r.value} fill={r.color} />
                    ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold font-mono tabular-nums text-fg">{total}</span>
              <span className="text-[11px] text-subtle">bugs</span>
            </div>
          </div>

          <ul className="flex-1 space-y-2">
            {rows.map((r) => (
              <li key={r.value}>
                <Link
                  to={`/bugs?status=${r.value}`}
                  className="group flex items-center gap-2 rounded text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="flex-1 text-muted group-hover:text-fg transition-colors">{r.label}</span>
                  <span className="font-mono tabular-nums text-fg">{r.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
