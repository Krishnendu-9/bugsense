import { formatDistanceToNow, format } from 'date-fns';

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

export const getBrowserInfo = () => ({
  browser: navigator.userAgent,
  os: navigator.platform,
  screenSize: `${window.screen.width}x${window.screen.height}`,
  userAgent: navigator.userAgent,
  version: '',
});

export const truncate = (str, length = 100) => {
  if (!str) return '';
  return str.length > length ? `${str.slice(0, length)}...` : str;
};

export const getInitials = (name = '') => {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

export const stripHtml = (html = '') => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

export const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const backendBase = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
};
