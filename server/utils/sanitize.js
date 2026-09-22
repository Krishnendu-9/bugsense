import sanitizeHtml from 'sanitize-html';

// Mirrors what the Quill toolbar in BugForm can produce. Anything outside this
// list (scripts, event handlers, iframes, inline styles) is stripped before the
// description is stored, because BugDetail renders it as HTML.
const RICH_TEXT_OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'ol', 'ul', 'li', 'pre', 'code', 'blockquote', 'a', 'span',
    'h1', 'h2', 'h3',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    // Quill 2 renders both list types as <ol> and distinguishes them here.
    li: ['data-list'],
    pre: ['class', 'spellcheck'],
    span: ['class'],
  },
  allowedClasses: {
    pre: ['ql-syntax'],
    span: ['ql-ui'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

export const sanitizeRichText = (html) => {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, RICH_TEXT_OPTIONS);
};

// For untrusted plain-text input (SDK telemetry) that is later shown in a slot
// which renders HTML: every tag is dropped and the remaining text is escaped.
export const toSafeText = (text) => {
  if (typeof text !== 'string') return '';
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
};

export const clampString = (value, max) => {
  if (value === undefined || value === null) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str.length > max ? str.slice(0, max) : str;
};
