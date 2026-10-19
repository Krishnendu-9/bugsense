import { NO_VALUE } from '../../utils/constants.js';

// The series is in UTC days (see /api/bugs/stats/trends), so the weekday is
// read in UTC too, or a viewer west of Greenwich would see every label shifted.
const weekday = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

const longDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Open bugs on each of the last seven days, today last.
 *
 * `days` is the API's openByDay.days, or null when it could not be loaded.
 * Peak and current are read off that same series rather than fetched again,
 * so the strip cannot disagree with itself.
 */
export default function TrendStrip({ days, loading }) {
  if (loading) {
    return (
      <div className="glass-card p-5 space-y-4">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="skeleton h-28 w-full rounded" />
      </div>
    );
  }

  const series = days || [];
  const peak = series.length ? Math.max(...series.map((d) => d.open)) : null;
  const current = series.length ? series.at(-1).open : null;
  // A week of zeros still needs a scale; 1 keeps every bar at its floor.
  const scale = Math.max(peak || 0, 1);

  return (
    <section className="glass-card p-5" aria-labelledby="trend-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="trend-heading" className="text-sm font-semibold text-fg">
          Open bugs this week
        </h2>
        <p className="text-xs text-muted">
          Peak <span className="font-mono text-fg">{peak ?? NO_VALUE}</span>
          <span className="mx-2 text-subtle" aria-hidden="true">·</span>
          Now <span className="font-mono text-fg">{current ?? NO_VALUE}</span>
        </p>
      </div>

      {series.length === 0 ? (
        <p className="mt-6 text-sm text-subtle">
          {NO_VALUE} The history could not be loaded, so there is no trend to show.
        </p>
      ) : (
        <>
          <ol className="mt-5 grid grid-cols-7 gap-2 sm:gap-3">
            {series.map((day, i) => {
              const today = i === series.length - 1;
              const height = day.open === 0 ? 0 : Math.max((day.open / scale) * 100, 6);
              return (
                <li key={day.date} className="flex flex-col items-center gap-2">
                  <div
                    className="relative h-28 w-full flex items-end"
                    title={`${longDate(day.date)}: ${day.open} open`}
                  >
                    {day.open === 0 ? (
                      // Keeps an empty day visible as a slot rather than a gap.
                      <div className="h-0.5 w-full rounded-full bg-track" />
                    ) : (
                      <div
                        className={`w-full rounded-t ${today ? 'bg-accent' : 'bg-subtle'}`}
                        style={{ height: `${height}%` }}
                      />
                    )}
                    <span className="sr-only">
                      {longDate(day.date)}: {day.open} open{today ? ' (today, so far)' : ''}
                    </span>
                  </div>
                  <span
                    className={`text-xs ${today ? 'text-fg font-medium' : 'text-subtle'}`}
                    aria-hidden="true"
                  >
                    {weekday(day.date)}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-subtle">
            Counted at the end of each day in UTC; today is counted now.
          </p>
        </>
      )}
    </section>
  );
}
