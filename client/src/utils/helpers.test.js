import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDuration, formatStatDuration, getApiOrigin, getImageUrl, sanitizeHtml, statusOptionsFor, stripHtml, toCsvCell } from './helpers.js';

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

describe('statusOptionsFor', () => {
  const reporter = { _id: 'u1', role: 'reporter' };
  const other = { _id: 'u2', role: 'reporter' };
  const dev = { _id: 'u3', role: 'developer' };
  const bug = (status) => ({ status, reporter: { _id: 'u1' } });

  it('gives staff every status', () => {
    expect(statusOptionsFor(dev, bug('open'))).toEqual(['open', 'in-progress', 'resolved', 'closed']);
  });

  it('lets the reporter close an active bug but not move it along', () => {
    expect(statusOptionsFor(reporter, bug('open'))).toEqual(['open', 'closed']);
    expect(statusOptionsFor(reporter, bug('in-progress'))).toEqual(['in-progress', 'closed']);
  });

  it('lets the reporter reopen a resolved or closed bug', () => {
    expect(statusOptionsFor(reporter, bug('resolved'))).toEqual(['open', 'resolved', 'closed']);
    expect(statusOptionsFor(reporter, bug('closed'))).toEqual(['open', 'closed']);
  });

  it('gives other reporters nothing', () => {
    expect(statusOptionsFor(other, bug('open'))).toEqual([]);
    expect(statusOptionsFor(reporter, { status: 'open', reporter: null })).toEqual([]);
  });
});

describe('formatDuration', () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;

  it('switches to days at 24 hours, so one column never mixes 47h with 2d', () => {
    expect(formatDuration(23 * HOUR + 59 * MIN)).toBe('23h');
    expect(formatDuration(24 * HOUR)).toBe('1d');
    expect(formatDuration(47 * HOUR)).toBe('1d');
    expect(formatDuration(48 * HOUR)).toBe('2d');
  });

  it('uses minutes under an hour and never rounds a short duration to zero', () => {
    expect(formatDuration(0)).toBe('<1m');
    expect(formatDuration(59 * 1000)).toBe('<1m');
    expect(formatDuration(45 * MIN)).toBe('45m');
  });

  it('returns null for a value that does not exist, so the caller shows a dash', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
    expect(formatDuration(-1)).toBeNull();
  });
});

describe('formatStatDuration', () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;

  it('keeps hours up to 72 so a headline median does not hide a quarter-day', () => {
    expect(formatStatDuration(30 * HOUR)).toBe('30h');
    expect(formatStatDuration(71 * HOUR)).toBe('71h');
  });

  it('switches to days with one decimal at 72 hours', () => {
    expect(formatStatDuration(72 * HOUR)).toBe('3.0d');
    expect(formatStatDuration(100 * HOUR)).toBe('4.2d');
    // Rounds before choosing the unit: never "72h".
    expect(formatStatDuration(71 * HOUR + 40 * MIN)).toBe('3.0d');
  });

  it('uses minutes under an hour and returns null when there is no value', () => {
    expect(formatStatDuration(45 * MIN)).toBe('45m');
    expect(formatStatDuration(59 * MIN + 40 * 1000)).toBe('1h');
    expect(formatStatDuration(10 * 1000)).toBe('<1m');
    expect(formatStatDuration(null)).toBeNull();
  });
});
