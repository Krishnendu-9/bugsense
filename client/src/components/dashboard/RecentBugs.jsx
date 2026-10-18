import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { NO_VALUE } from '../../utils/constants.js';
import { compactAgo, formatDate } from '../../utils/helpers.js';
import { PriorityText, StatusMark } from '../common/Badge.jsx';

/**
 * The most recently active bugs as a table. `bugs` is /stats.recent, already
 * sorted by updatedAt on the server so the Updated column reads in order.
 */
export default function RecentBugs({ bugs, loading }) {
  return (
    <section className="glass-card" aria-labelledby="recent-heading">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 id="recent-heading" className="text-sm font-semibold text-fg">
          Recent
        </h2>
        <Link
          to="/bugs"
          className="flex items-center gap-1 text-xs text-muted hover:text-fg transition-colors"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="px-5 pb-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-full rounded" />
          ))}
        </div>
      ) : !bugs || bugs.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-subtle">
          {bugs ? 'No bugs reported yet.' : 'Could not load recent bugs.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs text-subtle">
                <th scope="col" className="px-5 py-2 font-medium">Bug</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Priority</th>
                <th scope="col" className="px-3 py-2 font-medium">Project</th>
                <th scope="col" className="px-3 py-2 font-medium">Assignee</th>
                <th scope="col" className="px-5 py-2 font-medium text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {bugs.map((bug) => (
                <tr key={bug._id} className="border-b border-hairline last:border-0 hover:bg-track transition-colors">
                  <td className="px-5 py-2.5 max-w-0 w-[40%]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        to={`/bugs/${bug._id}`}
                        className="truncate text-fg hover:text-accent transition-colors focus:outline-none focus-visible:underline"
                        title={bug.title}
                      >
                        {bug.title}
                      </Link>
                      {bug.source === 'sdk' && (
                        <span
                          className="flex-shrink-0 rounded border border-border px-1.5 text-[11px] font-mono tabular-nums text-muted"
                          title={`Reported by the SDK ${bug.occurrences} time${bug.occurrences === 1 ? '' : 's'}`}
                        >
                          ×{bug.occurrences}
                        </span>
                      )}
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
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {bug.assignedTo?.name ? (
                      <span className="text-fg">{bug.assignedTo.name}</span>
                    ) : (
                      <span className="text-subtle">Unassigned</span>
                    )}
                  </td>
                  <td
                    className="px-5 py-2.5 whitespace-nowrap text-right font-mono tabular-nums text-muted"
                    title={formatDate(bug.updatedAt, 'MMM d, yyyy HH:mm')}
                  >
                    {compactAgo(bug.updatedAt) || NO_VALUE}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
