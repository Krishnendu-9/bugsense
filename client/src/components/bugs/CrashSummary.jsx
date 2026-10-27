import { Copy, RotateCcw, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { findRegressions, formatDate, timeAgo } from '../../utils/helpers.js';

/*
 * Crash summary for a bug page: count, first and last crash, regression,
 * fingerprint. A neutral surface: an SDK crash is not urgent by being one.
 * Only the regression line carries colour.
 */
export default function CrashSummary({ bug }) {
  const sdk = bug.source === 'sdk';
  const regressions = findRegressions(bug.statusHistory);
  const lastRegression = regressions.at(-1);
  const occurrences = bug.occurrences || 1;

  const copyFingerprint = async () => {
    try {
      // Absent outside secure contexts; the throw lands in the catch.
      await navigator.clipboard.writeText(bug.fingerprint);
      toast.success('Fingerprint copied');
    } catch {
      toast.error('Could not copy the fingerprint');
    }
  };

  return (
    <section aria-label="Crash summary" className="glass-card px-4 py-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-2 font-semibold text-fg">
          <Zap size={16} className="text-muted" aria-hidden="true" />
          <span><span className="font-mono">{occurrences}</span> {occurrences === 1 ? 'occurrence' : 'occurrences'}</span>
        </span>
        <span className="text-muted">
          First crash <span className="text-fg">{formatDate(bug.firstSeenAt || bug.createdAt)}</span>
        </span>
        <span className="text-muted" title={`When the SDK last reported this crash: ${formatDate(bug.lastSeenAt || bug.updatedAt, 'MMM d, yyyy HH:mm')}`}>
          Last crash <span className="text-fg">{timeAgo(bug.lastSeenAt || bug.updatedAt)}</span>
        </span>
        {sdk && <span className="text-muted">Reported by the SDK</span>}
        {bug.fingerprint && (
          <button
            type="button"
            onClick={copyFingerprint}
            title={`Fingerprint ${bug.fingerprint} (click to copy)`}
            aria-label={`Copy fingerprint ${bug.fingerprint}`}
            className="sm:ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-0.5 text-xs text-muted hover:text-fg hover:bg-track transition-colors"
          >
            Fingerprint <span className="font-mono text-fg">{bug.fingerprint.slice(0, 8)}</span>
            <Copy size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {lastRegression && (
        <p className="flex items-start gap-2 text-sm font-semibold text-danger">
          <RotateCcw size={15} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>
            Regressed {timeAgo(lastRegression.at)}: it crashed again after being{' '}
            {lastRegression.previous
              ? `${lastRegression.previous.status}${lastRegression.previous.changedBy?.name ? ` by ${lastRegression.previous.changedBy.name}` : ''} on ${formatDate(lastRegression.previous.changedAt)}`
              : 'resolved'}
            .
            {regressions.length > 1 && (
              <span className="font-normal text-muted"> {regressions.length} regressions in total.</span>
            )}
          </span>
        </p>
      )}
    </section>
  );
}
