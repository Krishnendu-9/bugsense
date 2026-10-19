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

// Who reported a bug. Values are the API's `source` enum; a manual report is
// one a person typed in. ('api' exists in the model but nothing creates it.)
export const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Reported by a person' },
  { value: 'sdk', label: 'Captured by the SDK' },
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

// Only high and critical priority carry a colour of their own; low and medium
// render in muted, so a list of bugs does not read as a wall of traffic lights.
export const PRIORITY_COLORS = {
  low: 'text-muted bg-track border-border',
  medium: 'text-muted bg-track border-border',
  high: 'text-priority-high bg-priority-high/10 border-priority-high/30',
  critical: 'text-priority-critical bg-priority-critical/10 border-priority-critical/30',
};

// Closed is deliberately colourless: it is an end state, not a signal.
export const STATUS_COLORS = {
  open: 'text-status-open bg-status-open/10 border-status-open/30',
  'in-progress': 'text-status-progress bg-status-progress/10 border-status-progress/30',
  resolved: 'text-status-resolved bg-status-resolved/10 border-status-resolved/30',
  closed: 'text-muted bg-track border-border',
};

// Status marks -- the filled squares and dots (StatusMark, the bug page's
// status history). Graphics, so In Progress takes the graphics amber
// (--status-progress-mark), not the text colour above. Look the class up here;
// never derive it from a text class at runtime: Tailwind only generates
// classes it can read in the source.
export const STATUS_MARK_COLORS = {
  open: 'bg-status-open',
  'in-progress': 'bg-status-progress-mark',
  resolved: 'bg-status-resolved',
  closed: 'bg-subtle',
};

// Severity has no tokens of its own; it borrows the priority scale, which runs
// in the same direction.
export const SEVERITY_COLORS = {
  minor: 'text-muted bg-track border-border',
  major: 'text-priority-high bg-priority-high/10 border-priority-high/30',
  blocker: 'text-priority-critical bg-priority-critical/10 border-priority-critical/30',
};

/*
 * Status donut colours, by status value.
 *
 * These are token *names*, not colours: Recharts takes colours as props rather
 * than classes, so the chart components resolve them at render time through
 * useThemeTokens() and pick up the right palette for the active theme.
 */
export const STATUS_CHART_TOKENS = {
  open: 'status-open',
  // Segments are graphics, so in-progress takes the graphics amber.
  'in-progress': 'status-progress-mark',
  resolved: 'status-resolved',
  closed: 'subtle',
};

// Shown in place of a number the API could not supply. Never a zero: zero is a
// claim about the data, this is the absence of one. Wherever it appears, a
// caption beside it says why the number is missing.
export const NO_VALUE = '—';
