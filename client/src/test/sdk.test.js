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
    loadSdk();
    const values = [...document.querySelectorAll('#bugsense-modal-container option')].map((o) => o.value);
    expect(values).not.toContain('critical');
    expect(values).not.toContain('blocker');
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
