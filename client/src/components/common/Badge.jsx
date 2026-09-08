import { PRIORITY_COLORS, STATUS_COLORS, SEVERITY_COLORS } from '../../utils/constants.js';
import { capitalize } from '../../utils/helpers.js';

export function PriorityBadge({ priority }) {
  const cls = PRIORITY_COLORS[priority] || 'text-muted bg-white/5 border-white/10';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {capitalize(priority)}
    </span>
  );
}

export function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'text-muted bg-white/5 border-white/10';
  const label = status === 'in-progress' ? 'In Progress' : capitalize(status);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const cls = SEVERITY_COLORS[severity] || 'text-muted bg-white/5 border-white/10';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {capitalize(severity)}
    </span>
  );
}

export function RoleBadge({ role }) {
  const colors = {
    admin: 'text-priority-critical bg-priority-critical/10 border-priority-critical/30',
    developer: 'text-primary bg-primary/10 border-primary/30',
    reporter: 'text-muted bg-white/5 border-white/10',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[role] || colors.reporter}`}>
      {capitalize(role)}
    </span>
  );
}
