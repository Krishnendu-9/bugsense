import { Link } from 'react-router-dom';
import { NO_VALUE } from '../../utils/constants.js';
import { compactAgo, formatDate, shortFrame } from '../../utils/helpers.js';
import { PriorityText, StatusMark } from '../common/Badge.jsx';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/*
 * The muted second line under each title: the context that helps most when
 * scanning a list.
 *
 * A person's report: who reported it, how much discussion it has, and who
 * owns it.
 * An SDK bug: its fingerprint (what grouped the crashes together) and the top
 * stack frame -- the same frame the fingerprint was built from, cut from the
 * error log on the server so the log itself never reaches the list. Both are
 * data, so they are set in mono.
 */
function RowContext({ bug }) {
  if (bug.source === 'sdk') {
    const parts = [];
    if (bug.fingerprint) {
      parts.push(
        <span key="fp" title={`Fingerprint ${bug.fingerprint}`}>
          {bug.fingerprint.slice(0, 8)}
        </span>
      );
    }
    if (bug.topFrame) {
      // Function and file:line:col on screen; the complete frame on hover.
      parts.push(
        <span key="frame" title={bug.topFrame}>
          {shortFrame(bug.topFrame)}
        </span>
      );
    }
    if (!parts.length) return <span>No stack frame recorded</span>;
    return (
      <span className="font-mono">
        {parts.reduce((acc, part, i) => (i === 0 ? [part] : [...acc, <span key={`sep${i}`} aria-hidden="true"> · </span>, part]), [])}
      </span>
    );
  }

  const comments = bug.comments?.length || 0;
  return (
    <span>
      {/* Which person: the Source column only says that it was one. */}
      {bug.reporter?.name ? `Reported by ${bug.reporter.name}` : 'Reporter unknown'}
      <span aria-hidden="true"> · </span>
      {plural(comments, 'comment')}
      <span aria-hidden="true"> · </span>
      {bug.assignedTo?.name ? `Assigned to ${bug.assignedTo.name}` : 'Unassigned'}
    </span>
  );
}

/**
 * Bugs as a dense table: the same cells and marks as the Overview's Recent
 * table (StatusMark, PriorityText), so the two read as one system.
 */
export default function BugTable({ bugs }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-subtle">
            <th scope="col" className="px-5 py-2 font-medium">Bug</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Priority</th>
            <th scope="col" className="px-3 py-2 font-medium">Project</th>
            <th scope="col" className="px-3 py-2 font-medium">Source</th>
            <th scope="col" className="px-5 py-2 font-medium text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {bugs.map((bug) => {
            const sdk = bug.source === 'sdk';
            return (
              <tr key={bug._id} className="border-b border-hairline last:border-0 hover:bg-track transition-colors">
                <td className="px-5 py-2.5 max-w-0 w-[46%]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      to={`/bugs/${bug._id}`}
                      className="truncate text-fg hover:text-accent transition-colors focus:outline-none focus-visible:underline"
                      title={bug.title}
                    >
                      {bug.title}
                    </Link>
                    {sdk && (
                      <span
                        className="flex-shrink-0 rounded border border-border px-1.5 text-[11px] font-mono tabular-nums text-muted"
                        title={`Reported by the SDK ${bug.occurrences} time${bug.occurrences === 1 ? '' : 's'}`}
                      >
                        ×{bug.occurrences}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-subtle">
                    <RowContext bug={bug} />
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <StatusMark status={bug.status} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <PriorityText priority={bug.priority} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                  {bug.project || <span className="text-subtle" aria-label="No project">{NO_VALUE}</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">{sdk ? 'SDK' : 'Person'}</td>
                <td
                  className="px-5 py-2.5 whitespace-nowrap text-right font-mono tabular-nums text-muted"
                  title={formatDate(bug.updatedAt, 'MMM d, yyyy HH:mm')}
                >
                  {compactAgo(bug.updatedAt) || NO_VALUE}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
