import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiOrigin, getImageUrl, sanitizeHtml, stripHtml, toCsvCell } from './helpers.js';

describe('sanitizeHtml', () => {
  it('removes scripts, event handlers and javascript: links', () => {
    const dirty = '<p>ok</p><img src="x" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>';
    const clean = sanitizeHtml(dirty);

    expect(clean).toContain('<p>ok</p>');
    expect(clean).not.toMatch(/onerror|<script|javascript:/i);
  });

  it('keeps ordinary rich-text formatting', () => {
    const html = '<p><strong>bold</strong> <em>i</em></p><ol><li>one</li></ol><pre>code</pre>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('handles empty input', () => {
    expect(sanitizeHtml(undefined)).toBe('');
  });
});

describe('stripHtml', () => {
  it('returns text only', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('handles empty input', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('toCsvCell', () => {
  it('quotes values and escapes embedded quotes', () => {
    expect(toCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it.each(['=SUM(A1)', '+1', '-1', '@cmd'])('neutralises spreadsheet formula %s', (value) => {
    expect(toCsvCell(value)).toBe(`"'${value}"`);
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsvCell(null)).toBe('""');
    expect(toCsvCell(undefined)).toBe('""');
  });
});

describe('getApiOrigin / getImageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('strips the trailing /api from an absolute URL', () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:5000/api');
    expect(getApiOrigin()).toBe('http://localhost:5000');
  });

  it('does not break hosts that contain "api"', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
    expect(getApiOrigin()).toBe('https://api.example.com');
  });

  it('keeps a path prefix in front of /api', () => {
    vi.stubEnv('VITE_API_URL', 'https://example.com/bugsense/api/');
    expect(getApiOrigin()).toBe('https://example.com/bugsense');
  });

  it('resolves a relative base against the current page', () => {
    vi.stubEnv('VITE_API_URL', '/api');
    expect(getApiOrigin()).toBe(window.location.origin);
  });

  it('builds upload URLs on the API origin and leaves absolute URLs alone', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
    expect(getImageUrl('/uploads/a.png')).toBe('https://api.example.com/uploads/a.png');
    expect(getImageUrl('https://cdn.example.com/b.png')).toBe('https://cdn.example.com/b.png');
    expect(getImageUrl('')).toBe('');
  });
});
