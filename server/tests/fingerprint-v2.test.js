// Fingerprint v2: docs/fingerprint-eval-v2.md, section 2, as read by its
// Amendment 1 (P1-P12). Stack lines below are the forms the three engines
// produced in the v1 evaluation corpus.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKeyV2,
  generateFingerprint,
  generateFingerprintV1,
  generateFingerprintV2,
  normaliseMessage,
  parseFrame,
  parseStack,
} from '../utils/fingerprint.util.js';

const BUNDLE = 'http://localhost:7110/assets/index-BOtVUl4o.js';
const BUNDLE_V2 = 'http://localhost:7110/assets/index-DvtLrm67.js';
const frame = (line) => {
  const f = parseFrame(line);
  return f && { fn: f.fn, file: f.file, kind: f.kind };
};

describe('parseFrame: V8 (Chromium, Node)', () => {
  it('reads `at FN (LOC)`, strips the content hash, keeps line and column', () => {
    assert.deepEqual(parseFrame(`    at r (${BUNDLE}:9:640)`), { fn: 'r', file: '/assets/index.js', line: 9, col: 640, kind: 'app' });
  });

  it('reduces the function to its own name: receiver, alias, async, new', () => {
    assert.equal(frame(`at Object.dispatch (${BUNDLE}:8:58450)`).fn, 'dispatch');
    assert.equal(frame(`at z.Yi [as describe] (${BUNDLE}:17:10489)`).fn, 'Yi');
    assert.equal(frame(`at XMLHttpRequest._ (${BUNDLE}:11:18956)`).fn, '_');
    assert.equal(frame(`at async ai (${BUNDLE}:17:5614)`).fn, 'ai');
    assert.equal(frame('at new Widget (http://localhost:7120/src/Widget.jsx:4:9)').fn, 'Widget');
  });

  it('reads `at LOC` as an anonymous frame, and `at async LOC` without the marker (P10)', () => {
    assert.deepEqual(frame(`at ${BUNDLE}:17:6262`), { fn: '', file: '/assets/index.js', kind: 'app' });
    assert.deepEqual(frame('at async /app/dist/routes/orders.js:12:5'), { fn: '', file: '/app/dist/routes/orders.js', kind: 'app' });
  });

  it('gives `X.<anonymous>` the empty name (P1)', () => {
    assert.equal(frame('at HTMLButtonElement.<anonymous> (http://localhost:7120/src/App.jsx:3:4)').fn, '');
    assert.equal(frame('at Server.<anonymous> (/app/dist/server.js:51:29)').fn, '');
  });

  it('marks native frames', () => {
    assert.deepEqual(frame('at JSON.parse (<anonymous>)'), { fn: 'parse', file: '', kind: 'native' });
    assert.equal(frame('at new Promise (<anonymous>)').kind, 'native');
    assert.equal(frame('at Array.map (native)').kind, 'native');
  });

  it('takes the inner URL of an eval frame, without its line and column (P2)', () => {
    const f = parseFrame(`at eval (eval at compile (${BUNDLE}:17:100), <anonymous>:3:20)`);
    assert.deepEqual({ fn: f.fn, file: f.file, kind: f.kind }, { fn: 'eval', file: '/assets/index.js', kind: 'app' });
    assert.equal(f.line, 17);
  });

  it('takes the innermost location of a nested eval frame (P2)', () => {
    const line = 'at eval (eval at a (eval at b (http://localhost:7120/src/rules.js:1:2), <anonymous>:3:4), <anonymous>:5:6)';
    assert.deepEqual(frame(line), { fn: 'eval', file: '/src/rules.js', kind: 'app' });
  });

  it('reads WebAssembly frames, named and numbered', () => {
    assert.deepEqual(frame('at wasm://wasm/d9b79cbe:wasm-function[0]:0x44'), { fn: 'wasm:0', file: 'wasm', kind: 'app' });
    assert.deepEqual(frame('at apply_discount (wasm://wasm/d9b79cbe:wasm-function[3]:0x2a)'), { fn: 'wasm:3', file: 'wasm', kind: 'app' });
  });

  it('classifies SDK, library and foreign frames', () => {
    assert.equal(frame('at window.fetch (https://bugsense.example/sdk/bugsense.js:185:20)').kind, 'sdk');
    assert.equal(frame('at settle (http://localhost:7120/node_modules/.vite/deps/axios.js:1203:12)').kind, 'library');
    assert.equal(frame('at reserve (file:///srv/mock/server.mjs:29:28)').kind, 'foreign');
    assert.equal(frame('at process.processTicksAndRejections (node:internal/process/task_queues:103:5)').kind, 'foreign');
    assert.equal(frame('at handler (/app/dist/routes/orders.js:12:5)').kind, 'app');
  });

  it('normalises digit-bearing path segments and blob: URLs', () => {
    assert.equal(frame('at window.legacyRecentlyViewed (http://localhost:7110/recently-viewed/12:3:9)').file, '/recently-viewed/<id>');
    assert.equal(frame('at applyDiscount (blob:http://localhost:7110/4f6cb1d2-0c1e-4a6b-9f00-6a1e2b3c4d5e:2:10)').file, 'blob:');
    assert.equal(frame('at load (http://localhost:7120/src/v2/cart.js:1:1)').file, '/src/<id>/cart.js');
  });
});

describe('parseFrame: SpiderMonkey (Firefox)', () => {
  it('reads `FN@LOC`', () => {
    assert.deepEqual(frame(`r@${BUNDLE}:9:640`), { fn: 'r', file: '/assets/index.js', kind: 'app' });
  });

  it('drops async-cause markers and /< nesting marks', () => {
    assert.equal(frame(`async*E@${BUNDLE}:9:499`).fn, 'E');
    assert.equal(frame(`EventHandlerNonNull*hr</<@${BUNDLE}:11:19154`).fn, 'hr');
    assert.equal(frame(`hr<@${BUNDLE}:11:18260`).fn, 'hr');
    assert.equal(frame(`Bi/<@${BUNDLE}:17:9242`).fn, 'Bi');
    assert.equal(frame(`li/</<@${BUNDLE}:5:31224`).fn, 'li');
  });

  it('reads an anonymous frame as the empty name', () => {
    assert.deepEqual(frame(`@${BUNDLE}:17:6267`), { fn: '', file: '/assets/index.js', kind: 'app' });
  });

  it('reads eval and Function frames; an unnamed one is called eval (P12)', () => {
    assert.deepEqual(frame(`anonymous@${BUNDLE} line 5 > Function:3:7`), { fn: 'anonymous', file: '/assets/index.js', kind: 'app' });
    assert.deepEqual(frame('@http://localhost:7120/src/rules.js line 2 > eval:1:5'), { fn: 'eval', file: '/src/rules.js', kind: 'app' });
  });

  it('reads a WebAssembly frame', () => {
    const line = `@${BUNDLE} line 8 > WebAssembly.instantiate:wasm-function[1]:0x5b`;
    assert.deepEqual(frame(line), { fn: 'wasm:1', file: 'wasm', kind: 'app' });
  });
});

describe('parseFrame: JavaScriptCore (WebKit)', () => {
  it('gives global and module code the empty name', () => {
    assert.deepEqual(frame('global code@http://localhost:7120/src/main.js:1:10'), { fn: '', file: '/src/main.js', kind: 'app' });
    assert.deepEqual(frame(`module code@${BUNDLE}:17:6267`), { fn: '', file: '/assets/index.js', kind: 'app' });
    assert.equal(frame('eval code@http://localhost:7120/src/rules.js:1:1').fn, '');
  });

  it('marks [native code] frames native and keeps their name', () => {
    assert.deepEqual(frame('json@[native code]'), { fn: 'json', file: '', kind: 'native' });
    assert.equal(frame('map@[native code]').kind, 'native');
  });

  it('reads a named WebAssembly frame', () => {
    assert.deepEqual(frame('<?>.wasm-function[apply_discount]@[wasm code]'), { fn: 'wasm:apply_discount', file: 'wasm', kind: 'app' });
  });
});

describe('parseFrame: lines in neither format', () => {
  it('returns null', () => {
    assert.equal(parseFrame("TypeError: Cannot read properties of undefined (reading 'map')"), null);
    assert.equal(parseFrame('Script error. at /products/reviews-widget:0:0'), null);
    assert.equal(parseFrame(''), null);
  });
});

describe('parseStack', () => {
  it('counts lines it cannot parse and skips blank ones', () => {
    const { frames, unparsed } = parseStack(`TypeError: boom\n\n    at r (${BUNDLE}:9:640)\n    at Object.ct (${BUNDLE}:5:9805)`);
    assert.deepEqual(frames.map((f) => f.fn), ['r', 'ct']);
    assert.equal(unparsed, 1);
  });

  it('drops a server stack pasted into a browser error message', () => {
    const log = [
      "Error: Inventory reservation failed: Cannot read properties of undefined (reading 'sku')",
      "TypeError: Cannot read properties of undefined (reading 'sku')",
      '    at reserve (file:///srv/mock/server.mjs:29:28)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)',
      `    at se (${BUNDLE}:9:400)`,
    ].join('\n');
    assert.deepEqual(parseStack(log).frames.map((f) => [f.fn, f.kind]), [['se', 'app']]);
  });

  it('keeps foreign frames as app frames when there is no app frame at all (P7)', () => {
    const log = 'Error: x\n    at main (file:///srv/job.mjs:3:1)\n    at node:internal/main/run_main_module:28:49';
    assert.deepEqual(parseStack(log).frames.map((f) => f.kind), ['app', 'app']);
  });
});

describe('normaliseMessage: engine wordings', () => {
  const same = (expected, ...messages) => {
    for (const m of messages) assert.equal(normaliseMessage(m), expected, m);
  };

  it('nullish property reads', () => {
    same(
      'nullish-read toFixed',
      "Cannot read properties of undefined (reading 'toFixed')",
      "Cannot read properties of null (reading 'toFixed')",
      'can\'t access property "toFixed", e is undefined',
      "undefined is not an object (evaluating 'e.toFixed')",
      "null is not an object (evaluating 'e.toFixed')"
    );
    same('nullish-read 1', "can't access property 1, code.match(...) is null");
    same('nullish-read key', 'undefined is not an object (evaluating \'a["key"]\')');
    same('nullish-read b', "undefined is not an object (evaluating 'a.b()')"); // P3
  });

  it('nullish writes, missing functions and constructors', () => {
    same('nullish-write zone', "Cannot set properties of undefined (setting 'zone')");
    same(
      'not-function trackPurchase',
      'e.trackPurchase is not a function',
      "tracker.trackPurchase is not a function. (In 'tracker.trackPurchase({\n  sku: 1\n})', 'tracker.trackPurchase' is undefined)"
    );
    same('not-constructor Widget', 'lib.Widget is not a constructor');
  });

  it('recursion, JSON, network, dynamic import, undefined variables', () => {
    same('recursion', 'Maximum call stack size exceeded', 'Maximum call stack size exceeded.', 'too much recursion');
    same(
      'json-parse',
      'Unexpected token \'s\', "sku-1x2" is not valid JSON',
      'Unexpected end of JSON input',
      'JSON.parse: unexpected character at line 1 column 1 of the JSON data',
      'JSON Parse error: Unexpected identifier "sku"'
    );
    same('network', 'Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed');
    same(
      'dynamic-import',
      'Failed to fetch dynamically imported module: http://localhost:7110/locales/pt-BR.js',
      'error loading dynamically imported module: http://localhost:7110/locales/pt-BR.js',
      'Importing a module script failed.'
    );
    same('undefined-var promoBanner', 'promoBanner is not defined', "Can't find variable: promoBanner");
  });

  it('React minified errors, axios status classes, wasm traps', () => {
    same('react#31', 'Minified React error #31; visit https://reactjs.org/docs/error-decoder.html for the full message');
    same('http 5xx', 'Request failed with status code 500', 'Request failed with status code 502');
    same('http 4xx', 'Request failed with status code 404');
    same('wasm-unreachable', 'unreachable', 'unreachable executed', "Unreachable code should not be executed (evaluating 't.apply(n,l)')");
  });

  it("maps WebKit's generic pattern message to json-parse only with a native json frame (P6)", () => {
    const msg = 'The string did not match the expected pattern.';
    const withJson = parseStack(`map@[native code]\njson@[native code]\nAa@${BUNDLE}:17:17158`).frames;
    assert.equal(normaliseMessage(msg, withJson), 'json-parse');
    assert.notEqual(normaliseMessage(msg, parseStack(`Aa@${BUNDLE}:17:17158`).frames), 'json-parse');
  });
});

describe('normaliseMessage: data stripped from other messages', () => {
  it('locale-formatted amounts', () => {
    assert.equal(normaliseMessage('Order total €1,234.56 exceeds the limit'), 'Order total <num> exceeds the limit');
    assert.equal(normaliseMessage('Order total 1.234,56 € exceeds the limit'), 'Order total <num> exceeds the limit');
  });

  it('JSON spans run to the last closing bracket, across lines (P4)', () => {
    assert.equal(normaliseMessage('Unexpected inventory response: {"a":{"b":1}}\n and {"c":2}'), 'Unexpected inventory response: <json>');
    assert.equal(normaliseMessage('Bad list [1, 2]'), 'Bad list <json>');
  });

  it('URLs, double-quoted strings and digit-bearing tokens; single quotes kept', () => {
    // The amount rule runs before the digit-token rule, so only the digits go.
    assert.equal(normaliseMessage('Product p-3310 not found'), 'Product p-<num> not found');
    assert.equal(normaliseMessage('Product p-3310 not found'), normaliseMessage('Product p-9921 not found'));
    assert.equal(normaliseMessage('Fetch https://api.example/v1/items?id=7 failed'), 'Fetch <url> failed');
    assert.equal(normaliseMessage('Unknown code "ABC"'), 'Unknown code <str>');
    assert.equal(normaliseMessage("Unknown field 'zone'"), "Unknown field 'zone'");
  });

  it('collapses whitespace and truncates to 200 characters', () => {
    assert.equal(normaliseMessage('a   b\n\tc'), 'a b c');
    assert.equal(normaliseMessage('x'.repeat(300)).length, 200);
  });
});

describe('generateFingerprintV2: one error, three engines', () => {
  const report = (title, errorLog) => ({ project: 'Shop', title, errorLog });
  const chromium = report(
    "Uncaught TypeError: Cannot read properties of undefined (reading 'toFixed')",
    `TypeError: Cannot read properties of undefined (reading 'toFixed')\n    at Ii (${BUNDLE}:17:8759)\n    at n (${BUNDLE}:17:8838)`
  );
  const firefox = report('TypeError: can\'t access property "toFixed", e is undefined', `Ii@${BUNDLE}:17:8757\nn@${BUNDLE}:17:8838`);
  const webkit = report("TypeError: undefined is not an object (evaluating 'e.toFixed')", `Ii@${BUNDLE}:17:8758\nn@${BUNDLE}:17:8840`);

  it('groups the same error from Chromium, Firefox and WebKit', () => {
    const fp = generateFingerprintV2(chromium);
    assert.equal(generateFingerprintV2(firefox), fp);
    assert.equal(generateFingerprintV2(webkit), fp);
  });

  it('builds the key as section 2.8 lays it out', () => {
    assert.equal(buildKeyV2(chromium), 'fp2::Shop::nullish-read toFixed::Ii@/assets/index.js::::');
    assert.match(generateFingerprintV2(chromium), /^[0-9a-f]{32}$/);
  });

  it('survives a release that only shifts lines or changes the chunk hash', () => {
    const moved = report(chromium.title, chromium.errorLog.replace(':17:8759', ':18:9101').replaceAll(BUNDLE, BUNDLE_V2));
    assert.equal(generateFingerprintV2(moved), generateFingerprintV2(chromium));
  });

  it('splits when the minifier renames the top function (the known limitation of 4.2)', () => {
    const renamed = report(chromium.title, chromium.errorLog.replace('at Ii (', 'at Ri ('));
    assert.notEqual(generateFingerprintV2(renamed), generateFingerprintV2(chromium));
  });

  it('keeps projects apart', () => {
    assert.notEqual(generateFingerprintV2({ ...chromium, project: 'Admin' }), generateFingerprintV2(chromium));
  });
});

describe('generateFingerprintV2: message sources', () => {
  const log = `TypeError: e.trackPurchase is not a function\n    at handleConfirm (http://localhost:7120/src/pages/checkout.jsx:40:7)`;

  it('gives an old-SDK report and a v2-SDK report of the same error the same key (8.1)', () => {
    const old = { project: 'Shop', title: 'Uncaught TypeError: e.trackPurchase is not a function', errorLog: log };
    const v2 = { ...old, error: { name: 'TypeError', message: 'e.trackPurchase is not a function' } };
    assert.equal(generateFingerprintV2(v2), generateFingerprintV2(old));
  });

  it('strips the rejection prefix from an old-SDK title', () => {
    const old = { project: 'Shop', title: 'Unhandled Promise Rejection: Request failed with status code 500', errorLog: `Wn@${BUNDLE}:11:11890` };
    assert.equal(buildKeyV2(old), 'fp2::Shop::http 5xx::Wn@/assets/index.js::::');
  });

  it("uses V8's header in place of a component-stack title, without the error name (P5)", () => {
    const v8 = {
      project: 'Shop',
      title: `\n    at Gi (${BUNDLE}:17:9913)\n    at Wi (${BUNDLE}:17:9990)`,
      errorLog: `TypeError: Cannot read properties of undefined (reading 'map')\n    at Gi (${BUNDLE}:17:9933)`,
    };
    assert.equal(buildKeyV2(v8), 'fp2::Shop::nullish-read map::Gi@/assets/index.js::::');
    const firefox = { ...v8, title: `\nGi@${BUNDLE}:17:9903`, errorLog: `Gi@${BUNDLE}:17:9923` };
    assert.equal(buildKeyV2(firefox), 'fp2::Shop::::Gi@/assets/index.js::::');
  });

  it('returns null when there is nothing to key on (P11)', () => {
    assert.equal(generateFingerprintV2({ project: 'Shop' }), null);
    assert.equal(buildKeyV2({ project: 'Shop', title: '', errorLog: '', error: { message: '' } }), null);
  });
});

describe('generateFingerprintV2: frame selection', () => {
  it('skips SDK and library frames for the top app frame', () => {
    const log = [
      'TypeError: x.y is not a function',
      '    at window.fetch (https://bugsense.example/sdk/bugsense.js:185:20)',
      '    at settle (http://localhost:7120/node_modules/.vite/deps/axios.js:1203:12)',
      '    at placeOrder (http://localhost:7120/src/checkout/placeOrder.js:22:9)',
    ].join('\n');
    assert.equal(buildKeyV2({ project: 'Shop', title: 'Uncaught TypeError: x.y is not a function', errorLog: log }), 'fp2::Shop::not-function y::placeOrder@/src/checkout/placeOrder.js::::');
  });

  it('uses a library frame when the stack has no app frame', () => {
    const log = 'TypeError: x.y is not a function\n    at settle (http://localhost:7120/node_modules/.vite/deps/axios.js:1203:12)';
    assert.equal(buildKeyV2({ project: 'Shop', title: 'TypeError: x.y is not a function', errorLog: log }), 'fp2::Shop::not-function y::settle@/node_modules/.vite/deps/axios.js::::');
  });

  it('separates different sites that share a message (A3/A4)', () => {
    const at = (fn) => ({ project: 'Shop', title: 'Uncaught Error: Invalid cart state', errorLog: `Error: Invalid cart state\n    at ${fn} (${BUNDLE}:8:1)` });
    assert.notEqual(generateFingerprintV2(at('b')), generateFingerprintV2(at('he')));
  });

  it('merges one helper bug reached from two callers (call-path variant)', () => {
    const via = (caller) => ({
      project: 'Shop',
      title: "Uncaught TypeError: Cannot read properties of undefined (reading 'replace')",
      errorLog: `TypeError: Cannot read properties of undefined (reading 'replace')\n    at slugify (http://localhost:7120/src/utils/slugify.js:3:9)\n    at ${caller} (http://localhost:7120/src/components/Share.jsx:9:2)`,
    });
    assert.equal(generateFingerprintV2(via('buildProductUrl')), generateFingerprintV2(via('buildSearchShareUrl')));
  });
});

describe('generateFingerprintV2: HTTP and network failures', () => {
  const crumb = (message) => [{ category: 'navigation', message: 'Page loaded: /checkout' }, { category: 'xhr', message }];
  const axios = (browser, crumbs) => ({
    project: 'Shop',
    title: 'Unhandled Promise Rejection: Request failed with status code 500',
    errorLog: browser === 'chromium'
      ? `AxiosError: Request failed with status code 500\n    at Wn (${BUNDLE}:11:11885)\n    at async ai (${BUNDLE}:17:5614)`
      : `Wn@${BUNDLE}:11:11890\n_@${BUNDLE}:11:18958`,
    breadcrumbs: crumbs,
  });

  it('keys on the failed request instead of frames', () => {
    const orders = crumb('API [POST] /api/orders (HTTP 500)');
    assert.equal(buildKeyV2(axios('chromium', orders)), 'fp2::Shop::http 5xx::::POST /api/orders::');
    assert.equal(generateFingerprintV2(axios('webkit', orders)), generateFingerprintV2(axios('chromium', orders)));
  });

  it('separates two endpoints and merges IDs in one route', () => {
    const a = generateFingerprintV2(axios('chromium', crumb('API [POST] /api/orders (HTTP 500)')));
    const b = generateFingerprintV2(axios('chromium', crumb('API [GET] /api/recommendations (HTTP 500)')));
    assert.notEqual(a, b);
    const p1 = generateFingerprintV2(axios('chromium', crumb('API [GET] /api/products/p-3310 (HTTP 500)')));
    const p2 = generateFingerprintV2(axios('chromium', crumb('API [GET] /api/products/p-9921 (HTTP 500)')));
    assert.equal(p1, p2);
  });

  it("gives the v2 SDK's request field the same key as the breadcrumb", () => {
    const viaCrumb = axios('chromium', crumb('API [GET] /api/products/p-3310 (HTTP 404)'));
    const viaField = { ...axios('chromium', []), request: { method: 'GET', url: '/api/products/p-3310?x=1', status: 404 } };
    assert.equal(generateFingerprintV2(viaField), generateFingerprintV2(viaCrumb));
  });

  it('falls back to the top frame when no request can be found (P8)', () => {
    assert.equal(buildKeyV2(axios('chromium', [])), 'fp2::Shop::http 5xx::Wn@/assets/index.js::::');
  });

  it('ignores breadcrumbs of requests that did not fail, and other errors', () => {
    assert.equal(buildKeyV2(axios('chromium', crumb('API [GET] /api/orders (HTTP 200)'))), 'fp2::Shop::http 5xx::Wn@/assets/index.js::::');
    const typeError = { project: 'Shop', title: 'Uncaught TypeError: x is not a function', errorLog: `TypeError: x is not a function\n    at go (${BUNDLE}:1:1)`, breadcrumbs: crumb('API [POST] /api/orders (FAILED)') };
    assert.equal(buildKeyV2(typeError), 'fp2::Shop::not-function x::go@/assets/index.js::::');
  });

  it('keys a stackless network failure on its request', () => {
    const r = (url) => ({ project: 'Shop', title: 'Unhandled Promise Rejection: Load failed', errorLog: 'Load failed', breadcrumbs: crumb(`API [POST] ${url} (FAILED)`) });
    assert.equal(buildKeyV2(r('http://localhost:7199/collect')), 'fp2::Shop::nostack::network::POST /collect::');
    assert.notEqual(generateFingerprintV2(r('http://localhost:7199/collect')), generateFingerprintV2(r('http://localhost:7198/upload')));
  });
});

describe('generateFingerprintV2: stackless reports', () => {
  it('keys a string rejection on its message', () => {
    const r = (reason) => ({ project: 'Shop', title: `Unhandled Promise Rejection: ${reason}`, errorLog: reason });
    assert.equal(buildKeyV2(r('timeout')), 'fp2::Shop::nostack::timeout::::');
    assert.notEqual(generateFingerprintV2(r('timeout')), generateFingerprintV2(r('quota exceeded')));
  });

  it('puts Script error. without a script URL in one bucket per project', () => {
    const page = (path) => ({ project: 'Shop', title: 'Script error.', errorLog: `Script error. at ${path}:0:0` });
    assert.equal(buildKeyV2(page('/products/reviews-widget')), 'fp2::Shop::script-error::');
    assert.equal(generateFingerprintV2(page('/products/reviews-widget')), generateFingerprintV2(page('/support/chat')));
  });

  it('keys Script error. on the script path when the browser gives one (P9)', () => {
    const firefox = (url) => ({ project: 'Shop', title: 'Script error.', errorLog: `Script error. at ${url}:0:0` });
    assert.equal(buildKeyV2(firefox('http://localhost:7104/reviews-widget-Ab12Cd34.js')), 'fp2::Shop::script-error::/reviews-widget.js');
    assert.notEqual(generateFingerprintV2(firefox('http://localhost:7104/reviews-widget.js')), generateFingerprintV2(firefox('http://localhost:7104/chat-widget.js')));
    const v2 = { project: 'Shop', title: 'Script error.', errorLog: '', source: { filename: 'http://localhost:7104/chat-widget.js', lineno: 0, colno: 0 } };
    assert.equal(buildKeyV2(v2), 'fp2::Shop::script-error::/chat-widget.js');
  });
});

describe('v1 key kept alongside v2', () => {
  it('exports the v1 key unchanged under its own name', () => {
    assert.equal(generateFingerprintV1, generateFingerprint);
    const log = `Error: boom\n    at r (${BUNDLE}:9:640)`;
    assert.notEqual(generateFingerprintV2({ project: 'p', errorLog: log, title: 'Error: boom' }), generateFingerprint(log, 'Error: boom', 'p'));
  });
});
