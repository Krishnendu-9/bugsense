import { History, Monitor, UserCheck } from 'lucide-react';
import Avatar from '../common/Avatar.jsx';
import { historyActor, timeAgo } from '../../utils/helpers.js';
import { STATUS_MARK_COLORS } from '../../utils/constants.js';

function PersonCard({ title, person }) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{title}</h3>
      {person ? (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar person={person} size="w-10 h-10" text="text-sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg truncate">{person.name}</p>
            <p className="text-xs text-muted truncate">{person.email}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Unknown</p>
      )}
    </div>
  );
}

// The bug page's side column: owner first (a triage fact), then reference.
export default function BugSidebar({ bug }) {
  const sdk = bug.source === 'sdk';

  return (
    <div className="space-y-4 min-w-0">
      {bug.assignedTo ? (
        <PersonCard title="Assigned To" person={bug.assignedTo} />
      ) : (
        <div className="glass-card p-5">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Assigned To</h3>
          <p className="text-sm text-muted flex items-center gap-2">
            <UserCheck size={14} /> Unassigned
          </p>
        </div>
      )}

      {/* Not for SDK crashes: the banner already says the SDK reported it. */}
      {!(sdk && !bug.reporter) && <PersonCard title="Reporter" person={bug.reporter} />}

      {(bug.browserInfo?.os || bug.browserInfo?.browser) && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={14} className="text-muted" />
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Browser Info</h3>
          </div>
          <div className="space-y-1.5 text-xs text-muted">
            {bug.browserInfo.browser && (
              <p>Browser: <span className="text-fg">{bug.browserInfo.browser} {bug.browserInfo.version}</span></p>
            )}
            {bug.browserInfo.os && <p>OS: <span className="text-fg">{bug.browserInfo.os}</span></p>}
            {bug.browserInfo.screenSize && <p>Screen: <span className="text-fg">{bug.browserInfo.screenSize}</span></p>}
            {bug.browserInfo.userAgent && (
              <p className="truncate" title={bug.browserInfo.userAgent}>
                UA: <span className="text-fg">{bug.browserInfo.userAgent}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {bug.statusHistory?.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <History size={14} className="text-muted" />
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Status History</h3>
          </div>
          <div className="relative">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-4">
              {bug.statusHistory.map((entry, i) => {
                // A static lookup on the mark tokens, shared with StatusMark.
                const dotColor = STATUS_MARK_COLORS[entry.status] || 'bg-subtle';
                return (
                  <div key={entry._id || i} className="flex gap-3 pl-6 relative">
                    <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-surface flex items-center justify-center bg-surface">
                      <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-fg capitalize">
                        {entry.status === 'in-progress' ? 'In Progress' : entry.status}
                      </p>
                      <p className="text-xs text-muted">by {historyActor(entry)}</p>
                      {entry.note && (
                        <p className="text-xs text-muted italic mt-0.5 break-words">&quot;{entry.note}&quot;</p>
                      )}
                      <p className="text-[10px] text-subtle mt-0.5">{timeAgo(entry.changedAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
