import { PRIORITY_COLORS, STATUS_COLORS, STATUS_MARK_COLORS, SEVERITY_COLORS, STATUS_OPTIONS } from '../../utils/constants.js';
import { capitalize } from '../../utils/helpers.js';

export function PriorityBadge({ priority }) {
  const cls = PRIORITY_COLORS[priority] || 'text-muted bg-track border-border';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {capitalize(priority)}
    </span>
  );
}

export function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'text-muted bg-track border-border';
  const label = status === 'in-progress' ? 'In Progress' : capitalize(status);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const cls = SEVERITY_COLORS[severity] || 'text-muted bg-track border-border';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {capitalize(severity)}
    </span>
  );
}

// A role is who someone is, not a state that needs attention, so every role
// gets the same neutral badge and the label alone tells them apart. (Admin
// was in the critical-priority red, which read as an alarm.)
export function RoleBadge({ role }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border text-muted bg-track border-border">
      {capitalize(role)}
    </span>
  );
}

/*
 * Table cells shared by every bug table (the Overview's Recent, the Bugs list),
 * so the two read as one system and a fix to one is a fix to both.
 *
 * Status is a small square plus the label; its colour comes from
 * STATUS_MARK_COLORS (constants.js), which every status mark shares.
 */

// Priority is plain text; only the two that need attention carry colour.
const PRIORITY_TEXT = {
  critical: 'text-priority-critical font-medium',
  high: 'text-priority-high',
};

export function StatusMark({ status }) {
  const label = STATUS_OPTIONS.find((s) => s.value === status)?.label || capitalize(status);
  return (
    <span className="inline-flex items-center gap-2 text-fg">
      <span className={`h-2 w-2 rounded-[2px] ${STATUS_MARK_COLORS[status] || 'bg-subtle'}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function PriorityText({ priority }) {
  return <span className={PRIORITY_TEXT[priority] || 'text-muted'}>{capitalize(priority)}</span>;
}

/*
 * How many times the SDK has reported this bug. A count of one isn't a count,
 * so the badge only appears from two upwards; where a single SDK report needs
 * telling apart, the view says SDK in its own words (a Source column, or the
 * board card's muted line).
 */
export function OccurrenceBadge({ bug }) {
  if (bug.source !== 'sdk' || !(bug.occurrences > 1)) return null;
  return (
    <span
      className="flex-shrink-0 rounded border border-border px-1.5 text-[11px] font-mono tabular-nums text-muted"
      title={`Reported by the SDK ${bug.occurrences} times`}
    >
      ×{bug.occurrences}
    </span>
  );
}
