export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export const SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor' },
  { value: 'major', label: 'Major' },
  { value: 'blocker', label: 'Blocker' },
];

export const ROLE_OPTIONS = [
  { value: 'reporter', label: 'Reporter' },
  { value: 'developer', label: 'Developer' },
  { value: 'admin', label: 'Admin' },
];

// Roles a visitor may choose at sign-up. Admin is provisioned by the seeder
// only — the API rejects it here regardless, so offering it would just lie.
export const SIGNUP_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => r.value !== 'admin');

export const PRIORITY_COLORS = {
  low: 'text-priority-low bg-priority-low/10 border-priority-low/30',
  medium: 'text-priority-medium bg-priority-medium/10 border-priority-medium/30',
  high: 'text-priority-high bg-priority-high/10 border-priority-high/30',
  critical: 'text-priority-critical bg-priority-critical/10 border-priority-critical/30',
};

export const STATUS_COLORS = {
  open: 'text-status-open bg-status-open/10 border-status-open/30',
  'in-progress': 'text-status-in-progress bg-status-in-progress/10 border-status-in-progress/30',
  resolved: 'text-status-resolved bg-status-resolved/10 border-status-resolved/30',
  closed: 'text-status-closed bg-status-closed/10 border-status-closed/30',
};

export const SEVERITY_COLORS = {
  minor: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  major: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  blocker: 'text-red-500 bg-red-500/10 border-red-500/30',
};

export const CHART_COLORS = ['#6366F1', '#8B5CF6', '#EF4444', '#7C3AED'];

export const STATUS_CHART_COLORS = {
  open: '#3B82F6',
  'in-progress': '#F59E0B',
  resolved: '#22C55E',
  closed: '#6B7280',
};
