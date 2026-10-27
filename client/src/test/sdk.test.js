import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The embeddable SDK is served by the API from server/public/sdk. It is plain
// browser JavaScript, so it is exercised here in jsdom rather than in the
// server's Node test runner. Vitest runs from the client directory.
const SDK_SOURCE = readFileSync(resolve(process.cwd(), '../server/public/sdk/bugsense.js'), 'utf8');

// Minimal XHR stand-in: completes synchronously with a fixed status.
class FakeXHR {
  static nextStatus = 404;
  constructor() {
    this.listeners = {};
    this.status = 0;
  }
  open() {}
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  send() {
    this.status = FakeXHR.nextStatus;
    (this.listeners.loadend || []).forEach((fn) => fn());
  }
}

let fetchMock;
let originals;

const loadSdk = () => {
  new Function(SDK_SOURCE)();
  return window.BugSense;
};

// The SDK reads its attributes from the last <script> on the page when it is
// not running from one (as here), so a tag with data-widget opts in.
const loadSdkWithWidget = () => {
  const tag = document.createElement('script');
  tag.setAttribute('data-widget', 'true');
  document.head.appendChild(tag);
  try {
    return loadSdk();
  } finally {
    tag.remove();
  }
};

// The payload of the most recent report the SDK posted.
const lastReport = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body);

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
  originals = {
    fetch: window.fetch,
    XMLHttpRequest: window.XMLHttpRequest,
    pushState: window.history.pushState,
    replaceState: window.history.replaceState,
    consoleError: console.error,
  };
  window.fetch = fetchMock;
  window.XMLHttpRequest = FakeXHR;
});

afterEach(() => {
  window.BugSense?.destroy();
  window.fetch = originals.fetch;
  window.XMLHttpRequest = originals.XMLHttpRequest;
  document.body.innerHTML = '';
});

describe('BugSense SDK', () => {
  it('records XHR requests (as axios makes them) without their query strings', async () => {
    const sdk = loadSdk();
    FakeXHR.nextStatus = 404;

    const xhr = new window.XMLHttpRequest();
    xhr.open('post', 'https://shop.example/api/orders?token=secret#frag');
    xhr.send();

    await sdk.captureError(new Error('boom'));
    const crumb = lastReport().breadcrumbs.find((b) => b.category === 'xhr');
    expect(crumb.message).toBe('API [POST] https://shop.example/api/orders (HTTP 404)');
    expect(JSON.stringify(lastReport())).not.toContain('secret');
  });

  it('records failed XHR requests', async () => {
    const sdk = loadSdk();
    FakeXHR.nextStatus = 0;

    const xhr = new window.XMLHttpRequest();
    xhr.open('GET', '/api/cart');
    xhr.send();

    await sdk.captureError(new Error('boom'));
    expect(lastReport().breadcrumbs.some((b) => b.message === 'API [GET] /api/cart (FAILED)')).toBe(true);
  });

  it('records pushState and replaceState navigation', async () => {
    const sdk = loadSdk();
    window.history.pushState({}, '', '/checkout?step=2');
    window.history.replaceState({}, '', '/checkout/payment?card=4242');

    await sdk.captureError(new Error('boom'));
    const messages = lastReport().breadcrumbs.map((b) => b.message);
    expect(messages).toContain('Navigated to /checkout');
    expect(messages).toContain('Replaced URL with /checkout/payment');
  });

  it('never records what the user typed', async () => {
    const sdk = loadSdk();
    const input = document.createElement('input');
    input.value = 'my-password';
    document.body.appendChild(input);
    input.click();

    await sdk.captureError(new Error('boom'));
    expect(JSON.stringify(lastReport())).not.toContain('my-password');
  });

  it('strips query strings from URLs inside stack traces', async () => {
    const sdk = loadSdk();
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at click (https://shop.example/app.js?token=abc:14:5)';

    await sdk.captureError(error);
    expect(lastReport().errorLog).toBe('Error: boom\n    at click (https://shop.example/app.js:14:5)');
  });

  it('offers no critical priority or blocker severity in the feedback widget', () => {
    loadSdkWithWidget();
    const values = [...document.querySelectorAll('#bugsense-modal-container option')].map((o) => o.value);
    expect(values).not.toContain('critical');
    expect(values).not.toContain('blocker');
  });

  it('adds no widget to the host page unless asked to', () => {
    loadSdk();
    expect(document.getElementById('bugsense-floating-pill')).toBeNull();
  });

  it('marks widget reports as feedback, so the server never merges them', async () => {
    loadSdkWithWidget();
    document.getElementById('bugsense-desc-input').value = 'The coupon field rejects valid codes';
    document.getElementById('bugsense-submit-btn').click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const report = lastReport();
    expect(report.kind).toBe('feedback');
    expect(report.description).toBe('The coupon field rejects valid codes');
  });

  it('keeps the label of a clicked button but not other page text', async () => {
    const sdk = loadSdk();
    document.body.innerHTML = '<button><span>Checkout</span></button><div class="profile">jane@example.com</div>';
    document.querySelector('button span').click();
    document.querySelector('.profile').click();

    await sdk.captureError(new Error('boom'));
    const messages = lastReport().breadcrumbs.filter((c) => c.category === 'click').map((c) => c.message);
    expect(messages[0]).toBe('Clicked <span> "Checkout"');
    expect(messages[1]).toBe('Clicked <div.profile>');
  });

  it('strips query strings from console messages', async () => {
    const sdk = loadSdk();
    console.error('Request failed: https://api.shop.example/orders?token=secret-123');

    await sdk.captureError(new Error('boom'));
    const crumb = lastReport().breadcrumbs.find((c) => c.category === 'console');
    expect(JSON.stringify(crumb)).not.toContain('secret-123');
    expect(crumb.message).toContain('https://api.shop.example/orders');
  });

  it('keeps a report within the body limit, so keepalive can carry it', async () => {
    const sdk = loadSdk();
    sdk.addBreadcrumb('console', 'state dump', { state: 'x'.repeat(70000) });
    sdk.captureMessage('y'.repeat(70000));

    const [, init] = fetchMock.mock.calls.at(-1);
    const report = JSON.parse(init.body);
    expect(report.breadcrumbs.at(-1).data).toEqual({ truncated: true });
    expect(report.description).toHaveLength(5000);
    expect(init.body.length).toBeLessThan(60000);
    expect(init.keepalive).toBe(true);
  });

  it('restores every patched global on destroy()', () => {
    const originalOpen = FakeXHR.prototype.open;
    const originalSend = FakeXHR.prototype.send;
    const sdk = loadSdk();
    expect(FakeXHR.prototype.open).not.toBe(originalOpen);

    sdk.destroy();

    expect(FakeXHR.prototype.open).toBe(originalOpen);
    expect(FakeXHR.prototype.send).toBe(originalSend);
    expect(window.fetch).toBe(fetchMock);
    expect(window.history.pushState).toBe(originals.pushState);
    expect(window.history.replaceState).toBe(originals.replaceState);
    expect(console.error).toBe(originals.consoleError);
    expect(window.BugSense).toBeUndefined();
    expect(document.getElementById('bugsense-floating-pill')).toBeNull();
  });
});

// SDK 1.4.0 payload fields: docs/fingerprint-eval-v2.md, 8.1 and Amendment 1
// (P13-P19).
describe('BugSense SDK 1.4.0 payload', () => {
  const crash = (init) => window.dispatchEvent(new ErrorEvent('error', init));
  const rejection = (reason) => {
    const event = new Event('unhandledrejection');
    event.reason = reason;
    window.dispatchEvent(event);
  };

  it('states its version', async () => {
    const sdk = loadSdk();
    await sdk.captureError(new Error('boom'));
    expect(lastReport().sdkVersion).toBe('1.5.0');
  });

  it('sends the error name and message as their own fields, and the stack as errorLog', async () => {
    const sdk = loadSdk();
    const error = new TypeError("Cannot read properties of undefined (reading 'map')");
    await sdk.captureError(error);
    expect(lastReport().error).toEqual({ name: 'TypeError', message: "Cannot read properties of undefined (reading 'map')" });
    expect(lastReport().errorLog).toBe(error.stack);
    expect(lastReport().title).toBe(error.message);
  });

  it('strips query strings from the message and caps it at 1,000 characters', async () => {
    const sdk = loadSdk();
    await sdk.captureError(new Error('Failed loading https://cdn.example/a.js?token=secret'));
    expect(lastReport().error.message).toBe('Failed loading https://cdn.example/a.js');
    await sdk.captureError(new Error('m'.repeat(5000)));
    expect(lastReport().error.message).toHaveLength(1000);
  });

  it('reports an uncaught Error with its location, without inventing a stack line', () => {
    loadSdk();
    const error = new Error('boom');
    crash({ message: 'Uncaught Error: boom', filename: 'https://cdn.example/widget.js?v=9', lineno: 3, colno: 7, error });
    const report = lastReport();
    expect(report.title).toBe('Uncaught Error: boom');
    expect(report.error).toEqual({ name: 'Error', message: 'boom' });
    expect(report.errorLog).toBe(error.stack);
    expect(report.source).toEqual({ filename: 'https://cdn.example/widget.js', lineno: 3, colno: 7 });
  });

  it('sends no error and no page path for a cross-origin Script error (P13, P18)', () => {
    loadSdk();
    window.history.pushState({}, '', '/products/reviews-widget');
    crash({ message: 'Script error.', filename: '', lineno: 0, colno: 0 });
    const report = lastReport();
    expect(report.title).toBe('Script error.');
    expect(report.error).toBeNull();
    expect(report.errorLog).toBe('');
    expect(report.source).toEqual({ filename: '', lineno: 0, colno: 0 });
    expect(report.errorLog).not.toContain('/products/reviews-widget');
  });

  it('describes a thrown value that is not an Error (P13)', () => {
    loadSdk();
    crash({ message: 'Uncaught Invalid quantity', error: 'Invalid quantity' });
    expect(lastReport().error).toEqual({ name: null, message: 'Invalid quantity' });
    expect(lastReport().errorLog).toBe('');
  });

  it('describes rejections: an Error, a string, a plain object, nothing', () => {
    loadSdk();
    const error = new Error('loadCart failed');
    rejection(error);
    expect(lastReport().error).toEqual({ name: 'Error', message: 'loadCart failed' });
    expect(lastReport().errorLog).toBe(error.stack);

    rejection('timeout');
    expect(lastReport()).toMatchObject({ title: 'Unhandled Promise Rejection: timeout', error: { name: null, message: 'timeout' }, errorLog: '' });

    rejection({ code: 'E_AUTH' });
    expect(lastReport().error).toEqual({ name: null, message: '{"code":"E_AUTH"}' });

    rejection(undefined);
    expect(lastReport().error).toBeNull();
  });

  it('treats an error-shaped object from another realm as an Error (P13)', () => {
    loadSdk();
    rejection({ name: 'AbortError', message: 'The operation was aborted.', stack: 'AbortError: The operation was aborted.' });
    expect(lastReport().error).toEqual({ name: 'AbortError', message: 'The operation was aborted.' });
    expect(lastReport().errorLog).toBe('AbortError: The operation was aborted.');
  });

  it('attaches the failed request to a fetch network failure', async () => {
    loadSdk();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const failure = await window.fetch('https://shop.example/api/upload?token=secret', { method: 'post' }).catch((e) => e);
    rejection(failure);
    expect(lastReport().request).toEqual({ method: 'POST', url: 'https://shop.example/api/upload', status: null });
    expect(JSON.stringify(lastReport())).not.toContain('secret');
  });

  it('takes an axios failure request from the recorded XHR, baseURL included (P14)', async () => {
    const sdk = loadSdk();
    FakeXHR.nextStatus = 404;
    const xhr = new window.XMLHttpRequest();
    xhr.open('get', '/api/products/p-1?ref=mail');
    xhr.send();
    const axiosError = Object.assign(new Error('Request failed with status code 404'), {
      name: 'AxiosError',
      isAxiosError: true,
      config: { method: 'get', url: '/products/p-1', baseURL: '/api' },
      request: xhr,
      response: { status: 404 },
    });

    await sdk.captureError(axiosError);
    expect(lastReport().request).toEqual({ method: 'GET', url: '/api/products/p-1', status: 404 });
    const crumb = lastReport().breadcrumbs.find((b) => b.category === 'xhr');
    expect(crumb.message).toBe('API [GET] /api/products/p-1 (HTTP 404)');
  });

  it('falls back to axios config when no XHR was recorded (P14)', async () => {
    const sdk = loadSdk();
    const axiosError = Object.assign(new Error('Network Error'), {
      name: 'AxiosError',
      isAxiosError: true,
      config: { method: 'post', url: 'orders?draft=1', baseURL: 'https://api.example/v1/' },
      request: {},
    });
    await sdk.captureError(axiosError);
    expect(lastReport().request).toEqual({ method: 'POST', url: 'https://api.example/v1/orders', status: null });
  });

  it('sends no request for an error that is not an HTTP or network failure', async () => {
    const sdk = loadSdk();
    await sdk.captureError(new Error('boom'));
    expect(lastReport().request).toBeNull();
  });
});

describe('BugSense.captureError second argument (P17)', () => {
  it('keeps a string as the title, exactly as before', async () => {
    const sdk = loadSdk();
    await sdk.captureError(new Error('boom'), 'Checkout failed');
    expect(lastReport().title).toBe('Checkout failed');
    expect(lastReport().componentStack).toBeUndefined();
  });

  it('keeps any other non-object as the title, as before', async () => {
    const sdk = loadSdk();
    await sdk.captureError(new Error('boom'), 42);
    expect(lastReport().title).toBe('42');
  });

  it('reads an object as options: componentStack goes in its own field, not the title', async () => {
    const sdk = loadSdk();
    const info = { componentStack: '\n    at Ta (https://shop.example/app.js?token=abc:17:3)\n    at table' };
    await sdk.captureError(new Error('boom'), info);
    expect(lastReport().title).toBe('boom');
    expect(lastReport().componentStack).toBe('\n    at Ta (https://shop.example/app.js:17:3)\n    at table');
  });

  it('caps the component stack at 5,000 characters', async () => {
    const sdk = loadSdk();
    await sdk.captureError(new Error('boom'), { componentStack: 'x'.repeat(9000) });
    expect(lastReport().componentStack).toHaveLength(5000);
  });

  it('describes a value that is not an Error', async () => {
    const sdk = loadSdk();
    await sdk.captureError('plain text');
    expect(lastReport()).toMatchObject({ title: 'Manual Error Capture', error: { name: null, message: 'plain text' }, errorLog: '' });
  });
});

describe('BugSense SDK cross-origin embed warning', () => {
  let warn;

  // Runs the SDK as if from a <script> tag with these attributes. jsdom does
  // not load the src; document.currentScript is pointed at the tag the way a
  // browser does while a classic script executes.
  const loadFromTag = (attrs) => {
    const tag = document.createElement('script');
    Object.entries(attrs).forEach(([name, value]) => tag.setAttribute(name, value));
    document.body.appendChild(tag);
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => tag });
    return loadSdk();
  };

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete document.currentScript;
    warn.mockRestore();
  });

  it('warns once when loaded cross-origin without the crossorigin attribute', () => {
    loadFromTag({ src: 'https://bugsense.example/sdk/bugsense.js' });
    loadFromTag({ src: 'https://bugsense.example/sdk/bugsense.js' }); // second copy is ignored

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('https://bugsense.example');
    expect(warn.mock.calls[0][0]).toContain('crossorigin="anonymous"');
  });

  it('stays quiet when the crossorigin attribute is present', () => {
    loadFromTag({ src: 'https://bugsense.example/sdk/bugsense.js', crossorigin: 'anonymous' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet when loaded from the page origin', () => {
    loadFromTag({ src: `${window.location.origin}/sdk/bugsense.js` });
    window.BugSense.destroy();
    loadFromTag({ src: '/sdk/bugsense.js' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet for data: sources, which are not opaque', () => {
    loadFromTag({ src: 'data:text/javascript,void 0' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('never guesses from other script tags when currentScript is unavailable', () => {
    // As for a module script or a loader that evaluates the source itself.
    const other = document.createElement('script');
    other.setAttribute('src', 'https://cdn.example/other.js');
    document.body.appendChild(other);

    loadSdk();
    expect(warn).not.toHaveBeenCalled();
    expect(window.BugSense).toBeDefined();
  });
});
