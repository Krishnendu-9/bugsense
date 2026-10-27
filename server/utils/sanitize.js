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

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

// Stored rich text as plain text for places that are not HTML (alerts, GitHub
// issues): block ends become line breaks, so paragraphs and list items stay
// apart, and the entities sanitize-html wrote are decoded back to characters.
export const htmlToText = (html) => {
  if (typeof html !== 'string' || !html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|pre|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const clampString = (value, max) => {
  if (value === undefined || value === null) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str.length > max ? str.slice(0, max) : str;
};
