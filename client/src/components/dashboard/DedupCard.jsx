import { NO_VALUE } from '../../utils/constants.js';

/**
 * The SDK deduplication pair from /api/health/metrics: crashes received, and
 * the incidents they were grouped into.
 *
 * All-time figures, and labelled as such. The SDK keeps one running
 * `occurrences` counter per incident, with no timestamp per crash, so a
 * per-day ("today") version of this pair is not recorded anywhere and is not
 * shown.
 *
 * `state` is one of:
 *   { kind: 'loading' }
 *   { kind: 'restricted' }            -- the endpoint is staff-only
 *   { kind: 'error' }
 *   { kind: 'ready', telemetry }      -- { sdkCrashesReceived, sdkIncidents, duplicatesMerged, dedupRate }
 */
export default function DedupCard({ state }) {
  if (state.kind === 'loading') {
    return (
      <div className="glass-card p-5 space-y-4">
        <div className="skeleton h-4 w-28 rounded" />
        <div className="skeleton h-8 w-20 rounded" />
        <div className="skeleton h-2 w-full rounded-full" />
        <div className="skeleton h-8 w-20 rounded" />
      </div>
    );
  }

  const t = state.kind === 'ready' ? state.telemetry : null;
  const rate = t?.dedupRate ?? null;

  let caption;
  if (state.kind === 'restricted') caption = 'Shown to developers and admins.';
  else if (state.kind === 'error') caption = 'Could not load the telemetry figures.';
  else if (rate === null) caption = 'No SDK crashes received yet, so there is no rate.';
  else caption = `${rate}% of crashes merged into an existing bug.`;

  const figure = (value) => (
    <span className={`font-mono tabular-nums ${t ? 'text-fg' : 'text-subtle'}`}>{t ? value : NO_VALUE}</span>
  );

  return (
    <section className="glass-card p-5 flex flex-col" aria-labelledby="dedup-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="dedup-heading" className="text-sm font-semibold text-fg">
          Deduplication
        </h2>
        <span className="text-xs text-subtle">All time · SDK</span>
      </div>

      <div className="mt-4">
        <p className="text-2xl font-semibold">{figure(t?.sdkCrashesReceived)}</p>
        <p className="text-xs text-muted">crashes received</p>
      </div>

      <div
        className="mt-3 h-2 rounded-full bg-track overflow-hidden"
        role="progressbar"
        aria-label="Share of crashes merged into an existing bug"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rate ?? undefined}
        aria-valuetext={rate === null ? 'No rate' : `${rate}%`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${rate ?? 0}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-subtle">{caption}</p>

      <div className="mt-3">
        <p className="text-2xl font-semibold">{figure(t?.sdkIncidents)}</p>
        <p className="text-xs text-muted">bugs after grouping</p>
      </div>

      <p className="mt-auto pt-4 text-[11px] text-subtle">
        Running totals: the SDK counts repeats per bug but does not record when each crash arrived.
      </p>
    </section>
  );
}
