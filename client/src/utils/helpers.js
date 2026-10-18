import { formatDistanceToNow, format } from 'date-fns';
import DOMPurify from 'dompurify';

export const timeAgo = (date) => {
  if (!date) return '';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

export const formatDate = (date, pattern = 'MMM d, yyyy') => {
  if (!date) return '';
  return format(new Date(date), pattern);
};

/**
 * A duration as one compact unit: "<1m", "45m", "23h", "1d", "6d". Switches to
 * days at 24 hours, so a column of these never sets "47h" above "2d" and asks
 * the reader to convert. Days are floored: 30 hours reads "1d". Returns null
 * for a missing or invalid value, so the caller decides what an absent number
 * looks like rather than getting "0m".
 */
export const formatDuration = (ms) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

/**
 * A duration as a headline statistic, where precision is the point: hours up
 * to 72, then days to one decimal. 30 hours reads "30h" (formatDuration would
 * say "1d" and hide six of them); 100 hours reads "4.2d". Rounds to the
 * nearest unit rather than flooring, since this is a measurement, not an age.
 * Returns null for a missing or invalid value.
 *
 * Not for table columns -- those use formatDuration, whose job is making rows
 * comparable at a glance.
 */
export const formatStatDuration = (ms) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  // Round once, then decide the unit, so 71h40m becomes "3.0d" rather than "72h".
  const hours = Math.round(ms / 3600000);
  if (hours < 72) return `${hours}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
};

// A frame location reduced to its file name, line and column:
// "https://shop.example.com/assets/Cart-3f9a1c.js:41:18" -> "Cart-3f9a1c.js:41:18".
// A query or hash left on the file name is dropped. Locations with no path
// ("<anonymous>", "native") come back unchanged.
const shortLocation = (location) => {
  const withoutQuery = location.replace(/[?#][^:]*/, '');
  return withoutQuery.split(/[\\/]/).pop() || location;
};

/**
 * A V8 stack frame shortened for a table cell: the function, then the file's
 * base name with line and column instead of the full URL. Shows
 * "at CartSummary (CartSummary-3f9a1c.js:41:18)" where the frame was
 * "at CartSummary (https://shop.example.com/assets/CartSummary-3f9a1c.js:41:18)".
 * Anything that is not a recognisable "at ..." frame is returned unchanged, so
 * the complete frame can always go in the title attribute.
 */
export const shortFrame = (frame) => {
  if (!frame) return frame;
  const named = frame.match(/^at (.+) \(([^()]+)\)$/);
  if (named) return `at ${named[1]} (${shortLocation(named[2])})`;
  const anonymous = frame.match(/^at (\S+)$/);
  if (anonymous) return `at ${shortLocation(anonymous[1])}`;
  return frame;
};

/** Compact relative time for dense tables: "3h ago", "6d ago". */
export const compactAgo = (date) => {
  if (!date) return null;
  const elapsed = formatDuration(Date.now() - new Date(date).getTime());
  return elapsed && `${elapsed} ago`;
};

export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// navigator.platform is deprecated; userAgentData is preferred where available.
const detectBrowser = (ua) => {
  const match =
    ua.match(/(Edg)\/([\d.]+)/) ||
    ua.match(/(Firefox)\/([\d.]+)/) ||
    ua.match(/(Chrome)\/([\d.]+)/) ||
    ua.match(/Version\/([\d.]+).*(Safari)/);
  if (!match) return { browser: 'Unknown', version: '' };
  if (match[2] === 'Safari') return { browser: 'Safari', version: match[1] };
  return { browser: match[1] === 'Edg' ? 'Edge' : match[1], version: match[2] };
};

export const getBrowserInfo = () => {
  const { browser, version } = detectBrowser(navigator.userAgent);
  return {
    browser,
    version,
    os: navigator.userAgentData?.platform || navigator.platform || 'Unknown',
    screenSize: `${window.screen.width}x${window.screen.height}`,
    userAgent: navigator.userAgent,
  };
};

export const truncate = (str, length = 100) => {
  if (!str) return '';
  return str.length > length ? `${str.slice(0, length)}...` : str;
};

export const getInitials = (name = '') => {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

// Parses into an inert document: unlike assigning innerHTML to an element of
// the live page, DOMParser never runs handlers or loads resources, so
// untrusted markup like <img onerror> cannot execute here.
export const stripHtml = (html = '') => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
};

// Defence in depth for rich-text descriptions rendered as HTML. The server
// already sanitizes on write; this also covers records stored before that.
export const sanitizeHtml = (html = '') =>
  DOMPurify.sanitize(html || '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe'],
    FORBID_ATTR: ['style'],
  });

// Origin (plus any path prefix) that serves the API, sockets and uploads,
// derived from VITE_API_URL. Handles absolute URLs, hosts that themselves
// contain "api" (https://api.example.com/api) and relative bases like "/api".
export const getApiOrigin = () => {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  try {
    const url = new URL(base, window.location.origin);
    const prefix = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
    return `${url.origin}${prefix}`;
  } catch {
    return window.location.origin;
  }
};

export const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `${getApiOrigin()}${url.startsWith('/') ? '' : '/'}${url}`;
};

// Quotes a value for CSV and neutralises spreadsheet formulas: a cell starting
// with = + - @ (e.g. an incident title from the public SDK) would otherwise
// execute when the export is opened in Excel or Sheets.
export const toCsvCell = (value) => {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
};

export const downloadFile = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const isStaff = (user) => user?.role === 'admin' || user?.role === 'developer';

export const isBugReporter = (user, bug) => {
  const reporterId = bug?.reporter?._id ?? bug?.reporter;
  return Boolean(user?._id) && Boolean(reporterId) && String(reporterId) === String(user._id);
};

const ALL_STATUSES = ['open', 'in-progress', 'resolved', 'closed'];

// Statuses `user` may move `bug` to, the current one included; mirrors
// canSetStatus on the server. Staff: any. The reporter: close it, or reopen it
// once resolved or closed. Anyone else: none.
export const statusOptionsFor = (user, bug) => {
  if (!bug) return [];
  if (isStaff(user)) return ALL_STATUSES;
  if (!isBugReporter(user, bug)) return [];
  const allowed = new Set([bug.status, 'closed']);
  if (bug.status === 'resolved' || bug.status === 'closed') allowed.add('open');
  return ALL_STATUSES.filter((status) => allowed.has(status));
};

// Converts a canvas data URL into a File so it can be uploaded as multipart.
export const dataUrlToFile = async (dataUrl, filename) => {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
};
