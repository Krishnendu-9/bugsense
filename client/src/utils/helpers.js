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

// Converts a canvas data URL into a File so it can be uploaded as multipart.
export const dataUrlToFile = async (dataUrl, filename) => {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
};
