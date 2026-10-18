import { PRIORITY_COLORS, STATUS_COLORS, SEVERITY_COLORS } from '../../utils/constants.js';
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
