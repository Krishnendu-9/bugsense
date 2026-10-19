import { afterEach, describe, expect, it, vi } from 'vitest';
import { findRegressions, formatDuration, formatStatDuration, getApiOrigin, shortFrame, getImageUrl, sanitizeHtml, statusOptionsFor, stripHtml, toCsvCell } from './helpers.js';

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

describe('shortFrame', () => {
  it('keeps the function and reduces the URL to file:line:col', () => {
    expect(shortFrame('at CartSummary (https://shop.example.com/assets/CartSummary-3f9a1c.js:41:18)')).toBe(
      'at CartSummary (CartSummary-3f9a1c.js:41:18)'
    );
    expect(shortFrame('at HTMLButtonElement.onCheckoutClick (https://shop.example.com/assets/checkout-a71c02.js:142:9)')).toBe(
      'at HTMLButtonElement.onCheckoutClick (checkout-a71c02.js:142:9)'
    );
    expect(shortFrame('at async loadCart (http://localhost:5173/src/cart/api.js:7:11)')).toBe('at async loadCart (api.js:7:11)');
  });

  it('shortens anonymous frames, bundler URLs, Windows paths and stray query strings', () => {
    expect(shortFrame('at https://shop.example.com/assets/index-9c2e.js:3:220')).toBe('at index-9c2e.js:3:220');
    expect(shortFrame('at render (webpack-internal:///./src/App.jsx:12:3)')).toBe('at render (App.jsx:12:3)');
    expect(shortFrame('at main (C:\\app\\server\\index.js:5:9)')).toBe('at main (index.js:5:9)');
    expect(shortFrame('at boot (https://cdn.example.com/app.js?v=3:1:200)')).toBe('at boot (app.js:1:200)');
  });

  it('leaves locations with no path, and anything that is not a frame, unchanged', () => {
    expect(shortFrame('at Array.map (<anonymous>)')).toBe('at Array.map (<anonymous>)');
    expect(shortFrame('at CartSummary (CartSummary.jsx:41:18)')).toBe('at CartSummary (CartSummary.jsx:41:18)');
    expect(shortFrame('render@App.jsx:12:3')).toBe('render@App.jsx:12:3');
    expect(shortFrame(null)).toBeNull();
  });
});

describe('findRegressions', () => {
  const dev = { _id: 'd1', name: 'Dev User' };
  const resolved = { status: 'resolved', changedBy: dev, changedAt: '2026-10-13T10:00:00Z', note: 'Fixed' };
  const reopenedBySdk = { status: 'in-progress', changedAt: '2026-10-18T15:10:00Z', note: 'Regression auto-detected' };

  it('finds a pipeline reopen of a resolved bug, with the entry that had resolved it', () => {
    expect(findRegressions([resolved, reopenedBySdk])).toEqual([
      { at: reopenedBySdk.changedAt, note: 'Regression auto-detected', previous: resolved },
    ]);
  });

  it('does not count a person moving a bug back to in progress', () => {
    expect(findRegressions([resolved, { ...reopenedBySdk, changedBy: dev }])).toEqual([]);
  });

  it('does not count an unattributed change that is not a reopen from resolved or closed', () => {
    const fromOpen = [{ status: 'open', changedBy: dev, changedAt: 'x' }, { status: 'in-progress', changedAt: 'y' }];
    expect(findRegressions(fromOpen)).toEqual([]);
    expect(findRegressions([resolved, { status: 'closed', changedAt: 'y' }])).toEqual([]);
  });

  it('lists every regression, oldest first, and copes with no history', () => {
    const twice = [resolved, reopenedBySdk, { ...resolved, changedAt: '2026-10-18T18:00:00Z' }, { ...reopenedBySdk, changedAt: '2026-10-19T08:00:00Z' }];
    expect(findRegressions(twice).map((r) => r.at)).toEqual([reopenedBySdk.changedAt, '2026-10-19T08:00:00Z']);
    expect(findRegressions(undefined)).toEqual([]);
    expect(findRegressions(null)).toEqual([]);
  });
});
