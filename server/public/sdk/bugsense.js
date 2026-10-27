/**
 * BugSense Client SDK (v1.5.0): crash reporting, breadcrumbs and a feedback widget
 * Embed in any website:
 * <script src="https://your-bugsense-host/sdk/bugsense.js"
 *         crossorigin="anonymous"
 *         data-api-url="https://your-bugsense-host"
 *         data-project="My Client App"
 *         data-key="optional-ingest-key"
 *         data-widget="true"></script>
 *
 * data-widget="true" adds the floating "Report Bug" button. Since 1.5.0 it is
 * off unless asked for, so embedding the SDK never changes the host's page.
 *
 * Privacy: the SDK never records form field values, keeps the text of clicked
 * buttons and links only, and strips query strings and fragments from every
 * URL it reports (console messages included), since those commonly carry tokens.
 */
(function (window, document) {
  'use strict';

  // Loading the script twice would wrap fetch/console twice and double-report.
  if (window.BugSense && window.BugSense.__initialized) return;

  // Loaded from another origin without crossorigin="anonymous", this script is
  // opaque to the page, and Chromium then dispatches no unhandledrejection at
  // all for fetch failures that pass through the SDK's fetch wrapper. Say so
  // once, and only when certain: currentScript is null for module scripts and
  // anything run later, and data:/blob: sources are not opaque.
  function warnIfOpaqueEmbed(script) {
    try {
      if (!script || !script.src || script.hasAttribute('crossorigin')) return;
      const src = new URL(script.src, window.location.href);
      if (!/^https?:$/.test(src.protocol) || src.origin === window.location.origin) return;
      console.warn(
        '[BugSense SDK] Loaded from ' + src.origin + ' without crossorigin="anonymous", so Chromium ' +
          'browsers will not report unhandled fetch failures on this page. Add crossorigin="anonymous" ' +
          'to the <script> tag; the BugSense server must send Access-Control-Allow-Origin for /sdk/ ' +
          '(current versions do), or the script will not load.'
      );
    } catch (err) {
      // The check is advisory; it must never stop the SDK starting.
    }
  }
  warnIfOpaqueEmbed(document.currentScript);

  // Read configuration from current script tag
  const currentScript = document.currentScript || Array.from(document.querySelectorAll('script')).pop();
  const apiUrl = (currentScript?.getAttribute('data-api-url') || 'http://localhost:5000').replace(/\/+$/, '');
  const project = currentScript?.getAttribute('data-project') || 'Production Web App';
  const ingestKey = currentScript?.getAttribute('data-key') || '';
  // Opt-in: the widget is visible UI on someone else's site.
  const enableWidget = currentScript?.getAttribute('data-widget') === 'true';

  const SDK_VERSION = '1.5.0';
  const MAX_BREADCRUMBS = 15;
  const MAX_TITLE_LENGTH = 200;
  // Below the server's 20,000 so the rest of a report fits in the body limit.
  const MAX_ERROR_LOG_LENGTH = 16000;
  // Browsers cap a keepalive request body at 64 KiB and reject a larger one
  // outright, so a bigger report is sent as a normal request instead.
  const KEEPALIVE_BODY_LIMIT = 60000;
  // The server caps these too (docs/fingerprint-eval-v2.md, Amendment 1, P15).
  const MAX_ERROR_NAME_LENGTH = 100;
  const MAX_ERROR_MESSAGE_LENGTH = 1000;
  const MAX_COMPONENT_STACK_LENGTH = 5000;
  // The server keeps no more than these, so sending more only risks the body limit.
  const MAX_DESCRIPTION_LENGTH = 5000;
  const MAX_BREADCRUMB_DATA_LENGTH = 2000;
  const MAX_REPORTS_PER_SESSION = 20;
  const REPEAT_SUPPRESSION_MS = 10000;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Drops ?query and #fragment, which frequently contain tokens or PII.
  function redactUrl(value) {
    try {
      const url = new URL(String(value), window.location.href);
      return url.origin === window.location.origin ? url.pathname : url.origin + url.pathname;
    } catch (err) {
      return String(value).split(/[?#]/)[0];
    }
  }

  // Stack traces embed script and page URLs, query strings included (e.g.
  // "at click (https://shop.example/?token=abc:14:5)"). Strip the query and
  // fragment while keeping the :line:column suffix.
  function scrubUrls(text) {
    return String(text || '').replace(
      /(https?:\/\/[^\s?#()]+)[?#][^\s()]*?(?=:\d+:\d+|\)|\s|$)/g,
      '$1'
    );
  }

  // JSON.stringify that cannot throw (circular refs, BigInt, exotic objects).
  function safeStringify(value) {
    const seen = new WeakSet();
    try {
      return JSON.stringify(value, function (_key, val) {
        if (typeof val === 'bigint') return val.toString();
        if (val && typeof val === 'object') {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        return val;
      });
    } catch (err) {
      return '[Unserializable]';
    }
  }

  function describeArg(arg) {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'object' && arg !== null) return safeStringify(arg);
    return String(arg);
  }

  function clamp(text, max) {
    const str = String(text || '');
    return str.length > max ? str.slice(0, max) : str;
  }

  // An Error, or anything shaped like one: errors from another realm (an
  // iframe) fail instanceof, and DOMExceptions carry name and message too.
  function isErrorLike(value) {
    return (
      value instanceof Error ||
      (value !== null && typeof value === 'object' && typeof value.name === 'string' && typeof value.message === 'string')
    );
  }

  // The `error` field and the stack for a thrown or rejected value. Nothing
  // thrown: no error, so the server reads the title as it does for older SDKs.
  // A value that is not an Error: { name: null, message } with the value as
  // text (JSON for an object).
  function describeThrown(value) {
    if (value === undefined || value === null) return { error: null, errorLog: '' };
    if (isErrorLike(value)) {
      return {
        error: { name: String(value.name), message: String(value.message) },
        errorLog: typeof value.stack === 'string' ? value.stack : '',
      };
    }
    return { error: { name: null, message: typeof value === 'string' ? value : describeArg(value) }, errorLog: '' };
  }

  // axios's own rule for combining baseURL with a relative request URL.
  function joinUrl(baseURL, url) {
    if (!baseURL || /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url)) return url;
    return String(baseURL).replace(/\/?\/$/, '') + '/' + String(url).replace(/^\/+/, '');
  }

  // A control whose label says what was clicked ("Checkout", "Save"). Only
  // these contribute text: anything else, a table row, a profile card, a
  // paragraph, is page content that may show a person's name, email or order.
  const LABELLED_CONTROL = 'button, a, summary, [role="button"], [role="menuitem"], [role="tab"]';

  // Elements whose visible text or value may be something the user typed.
  function isSensitiveElement(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      el.isContentEditable ||
      (el.closest && el.closest('[data-bugsense-mask]'))
    );
  }

  // ---------------------------------------------------------------------------
  // Flight Recorder breadcrumbs (ring buffer)
  // ---------------------------------------------------------------------------

  const breadcrumbs = [];

  // Breadcrumb data is free-form (BugSense.addBreadcrumb takes anything). The
  // server drops data over 2,000 characters, so it is dropped here as well,
  // before it can push a report past the request body limit.
  function boundedData(data) {
    if (!data) return {};
    return safeStringify(data).length > MAX_BREADCRUMB_DATA_LENGTH ? { truncated: true } : data;
  }

  function addBreadcrumb(category, message, data) {
    breadcrumbs.push({
      timestamp: new Date().toISOString(),
      category,
      message: clamp(message, 300),
      data: boundedData(data),
    });
    if (breadcrumbs.length > MAX_BREADCRUMBS) {
      breadcrumbs.shift();
    }
  }

  addBreadcrumb('navigation', 'Page loaded: ' + redactUrl(window.location.href), {
    url: redactUrl(window.location.href),
  });

  // Everything patched or subscribed is recorded here so destroy() can undo it.
  const cleanups = [];
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    cleanups.push(function () {
      target.removeEventListener(event, handler, options);
    });
  }

  // 1. DOM clicks — element identity, plus the label of a button or link;
  // never typed content or other page text
  listen(
    document,
    'click',
    function (e) {
      try {
        const target = e.target;
        if (!target || !target.tagName) return;
        const tag = target.tagName.toLowerCase();
        const id = target.id ? '#' + target.id : '';
        const cls = typeof target.className === 'string' && target.className.trim()
          ? '.' + target.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
        const control = target.closest ? target.closest(LABELLED_CONTROL) : null;
        const text = control && !isSensitiveElement(control) && !isSensitiveElement(target)
          ? (control.innerText || control.textContent || '').trim().slice(0, 30)
          : '';
        const snippet = text ? ' "' + text + '"' : '';

        addBreadcrumb('click', 'Clicked <' + tag + id + cls + '>' + snippet, {
          tag,
          id: target.id || null,
        });
      } catch (err) {
        // Breadcrumbs are best-effort and must never break the host page.
      }
    },
    true
  );

  // 2. History navigation (pushState for new entries, replaceState for
  // redirects and URL rewrites that single-page routers do in place)
  function wrapHistory(methodName, verb) {
    const original = window.history[methodName];
    if (!original) return;
    window.history[methodName] = function () {
      const result = original.apply(this, arguments);
      try {
        const newUrl = redactUrl(arguments[2] || window.location.href);
        addBreadcrumb('navigation', verb + ' ' + newUrl, { url: newUrl });
      } catch (err) {
        // Recording must never break the host's navigation.
      }
      return result;
    };
    cleanups.push(function () {
      window.history[methodName] = original;
    });
  }
  wrapHistory('pushState', 'Navigated to');
  wrapHistory('replaceState', 'Replaced URL with');
  listen(window, 'popstate', function () {
    const url = redactUrl(window.location.href);
    addBreadcrumb('navigation', 'Browser back/forward to ' + url, { url });
  });

  // Requests the wrappers below have seen, for the `request` field of a report
  // about a failed one. WeakMaps, so nothing is added to the host's objects.
  const xhrInfo = new WeakMap();
  const failedFetches = new WeakMap();

  // The failed request behind an error, for HTTP and network failures: a fetch
  // the wrapper saw fail, or an axios error. For axios, the URL is the one the
  // XHR wrapper recorded (so baseURL is included and it matches the
  // breadcrumb); config is the fallback when no XHR was recorded.
  function requestOf(value) {
    if (!value || typeof value !== 'object') return null;
    const fetched = failedFetches.get(value);
    if (fetched) return { method: fetched.method, url: fetched.url, status: null };
    if (value.isAxiosError !== true) return null;

    const response = value.response;
    const status = response && Number.isInteger(response.status) ? response.status : null;
    const recorded = value.request && typeof value.request === 'object' ? xhrInfo.get(value.request) : null;
    if (recorded) return { method: recorded.method, url: recorded.url, status: status ?? (recorded.status || null) };

    const config = value.config && typeof value.config === 'object' ? value.config : {};
    if (typeof config.url !== 'string') return null;
    return {
      method: String(config.method || 'GET').toUpperCase(),
      url: redactUrl(joinUrl(config.baseURL, config.url)),
      status,
    };
  }

  // 3. Fetch API calls
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      const rawUrl = typeof input === 'string' || input instanceof URL ? input : input?.url || 'unknown';
      const url = redactUrl(rawUrl);
      const method = String(init?.method || input?.method || 'GET').toUpperCase();

      return originalFetch.apply(this, arguments).then(
        function (response) {
          addBreadcrumb('xhr', 'API [' + method + '] ' + url + ' (HTTP ' + response.status + ')', {
            method,
            status: response.status,
            url,
          });
          return response;
        },
        function (err) {
          if (err && typeof err === 'object') failedFetches.set(err, { method, url });
          addBreadcrumb('xhr', 'API [' + method + '] ' + url + ' (FAILED)', {
            method,
            error: err?.message,
            url,
          });
          throw err;
        }
      );
    };
    cleanups.push(function () {
      window.fetch = originalFetch;
    });
  }

  // 3b. XMLHttpRequest calls. axios and many older libraries use XHR rather
  // than fetch, so without this their requests would be invisible. Request
  // details live in a WeakMap instead of on the host's XHR objects.
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try {
        xhrInfo.set(this, { method: String(method || 'GET').toUpperCase(), url: redactUrl(url) });
      } catch (err) {
        // Recording is best-effort.
      }
      return originalOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      const info = xhrInfo.get(this);
      if (info) {
        const xhr = this;
        xhr.addEventListener('loadend', function () {
          try {
            info.status = xhr.status;
            const outcome = xhr.status ? '(HTTP ' + xhr.status + ')' : '(FAILED)';
            addBreadcrumb('xhr', 'API [' + info.method + '] ' + info.url + ' ' + outcome, {
              method: info.method,
              status: xhr.status,
              url: info.url,
            });
          } catch (err) {
            // Recording is best-effort.
          }
        });
      }
      return originalSend.apply(this, arguments);
    };

    cleanups.push(function () {
      XHR.prototype.open = originalOpen;
      XHR.prototype.send = originalSend;
    });
  }

  // 4. Console errors
  const originalConsoleError = console.error;
  console.error = function () {
    try {
      // Logged values often hold request URLs, and their query strings tokens.
      const msg = scrubUrls(Array.from(arguments).map(describeArg).join(' '));
      addBreadcrumb('console', 'Console Error: ' + msg.slice(0, 120), { raw: msg.slice(0, 1000) });
    } catch (err) {
      // Never let recording interfere with the host's own logging.
    }
    return originalConsoleError.apply(console, arguments);
  };
  cleanups.push(function () {
    console.error = originalConsoleError;
  });

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  // Guardrails: a render loop can fire window.onerror continuously. Cap the
  // number of reports per page session and suppress repeats of an error we
  // have already reported, so a broken host page cannot flood the ingest API.
  let reportsSent = 0;
  const recentlySent = Object.create(null);

  function shouldSend(payload) {
    if (reportsSent >= MAX_REPORTS_PER_SESSION) return false;

    const key = (payload.title || '') + '::' + (payload.errorLog || '').slice(0, 200);
    const now = Date.now();
    if (recentlySent[key] && now - recentlySent[key] < REPEAT_SUPPRESSION_MS) return false;

    recentlySent[key] = now;
    reportsSent += 1;
    return true;
  }

  function detectBrowser() {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Firefox/')) return 'Firefox';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Safari/')) return 'Safari';
    return 'Browser';
  }

  // Resolves true when the server accepted the report.
  function sendTelemetry(payload) {
    if (!shouldSend(payload)) return Promise.resolve(false);

    const error = payload.error;
    const fullPayload = Object.assign({}, payload, {
      sdkVersion: SDK_VERSION,
      title: clamp(scrubUrls(payload.title), MAX_TITLE_LENGTH),
      errorLog: payload.errorLog ? clamp(scrubUrls(payload.errorLog), MAX_ERROR_LOG_LENGTH) : payload.errorLog,
      description: payload.description ? clamp(scrubUrls(payload.description), MAX_DESCRIPTION_LENGTH) : payload.description,
      error: error
        ? {
            name: error.name === null ? null : clamp(error.name, MAX_ERROR_NAME_LENGTH),
            message: clamp(scrubUrls(error.message), MAX_ERROR_MESSAGE_LENGTH),
          }
        : null,
      componentStack: payload.componentStack
        ? clamp(scrubUrls(payload.componentStack), MAX_COMPONENT_STACK_LENGTH)
        : undefined,
      project,
      breadcrumbs: breadcrumbs.slice(),
      browserInfo: {
        browser: detectBrowser(),
        version: '',
        os: navigator.userAgentData?.platform || navigator.platform || 'Unknown OS',
        screenSize: window.innerWidth + 'x' + window.innerHeight,
        userAgent: navigator.userAgent,
      },
    });

    const headers = { 'Content-Type': 'application/json' };
    if (ingestKey) headers['X-BugSense-Key'] = ingestKey;

    // Use the unpatched fetch: routing through our own wrapper would record an
    // xhr breadcrumb for every report the SDK itself sends.
    const send = (originalFetch || window.fetch).bind(window);
    const body = safeStringify(fullPayload);
    return send(apiUrl + '/api/telemetry/report', {
      method: 'POST',
      headers,
      body,
      // keepalive lets a report outlive the page, but only under 64 KiB.
      keepalive: body.length < KEEPALIVE_BODY_LIMIT,
    })
      .then(function (res) {
        return res.ok;
      })
      .catch(function (err) {
        originalConsoleError.call(console, '[BugSense SDK] Failed to send telemetry report:', err);
        return false;
      });
  }

  // 5. Global error handlers (auto-telemetry on unhandled crashes)
  // A non-negative integer position from an ErrorEvent, else null.
  function position(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  listen(window, 'error', function (event) {
    // Resource load errors (img/script 404s) bubble here without an Error.
    if (!event.message && !event.error) return;
    const thrown = describeThrown(event.error);
    addBreadcrumb('error', 'Crash: ' + event.message, {});

    sendTelemetry({
      title: event.message || 'Uncaught JavaScript Error',
      errorLog: thrown.errorLog,
      error: thrown.error,
      request: requestOf(event.error),
      // No filename means the browser withheld it (a cross-origin script):
      // send none, never the page URL in its place.
      source: {
        filename: event.filename ? redactUrl(event.filename) : '',
        lineno: position(event.lineno),
        colno: position(event.colno),
      },
      description: 'Auto-captured crash on ' + redactUrl(window.location.href),
      severity: 'major',
      priority: 'high',
    });
  });

  listen(window, 'unhandledrejection', function (event) {
    const reason = event.reason;
    const thrown = describeThrown(reason);
    const title = 'Unhandled Promise Rejection: ' + clamp(reason?.message || describeArg(reason), 150);
    addBreadcrumb('error', title, {});

    sendTelemetry({
      title,
      errorLog: thrown.errorLog,
      error: thrown.error,
      request: requestOf(reason),
      description: 'Unhandled async promise failure on ' + redactUrl(window.location.href),
      severity: 'major',
      priority: 'high',
    });
  });

  // ---------------------------------------------------------------------------
  // 6. In-app floating bug feedback widget
  // ---------------------------------------------------------------------------

  let widgetInjected = false;
  let widgetNodes = [];

  function injectWidget() {
    if (widgetInjected || !document.body) return;
    widgetInjected = true;

    // Trigger Pill Button
    const btn = document.createElement('button');
    btn.id = 'bugsense-floating-pill';
    btn.type = 'button';
    btn.innerHTML = '🐞 <span style="font-weight:600;font-size:13px;letter-spacing:0.3px;">Report Bug</span>';
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 9999px;
      padding: 10px 18px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4), 0 8px 10px -6px rgba(79, 70, 229, 0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    btn.onmouseenter = function () {
      btn.style.transform = 'translateY(-2px) scale(1.03)';
    };
    btn.onmouseleave = function () {
      btn.style.transform = 'translateY(0) scale(1)';
    };

    // Modal Container
    const modal = document.createElement('div');
    modal.id = 'bugsense-modal-container';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Report an issue');
    modal.setAttribute('data-bugsense-mask', '');
    modal.style.cssText = `
      display: none;
      position: fixed;
      bottom: 80px;
      right: 24px;
      z-index: 999999;
      width: min(360px, calc(100vw - 48px));
      box-sizing: border-box;
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #F8FAFC;
    `;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:18px;">🐞</span>
          <span style="font-weight:700;font-size:15px;color:#F1F5F9;">Report an Issue</span>
        </div>
        <button type="button" id="bugsense-close-btn" aria-label="Close" style="background:none;border:none;color:#94A3B8;cursor:pointer;font-size:18px;line-height:1;">✕</button>
      </div>
      <p style="font-size:12px;color:#94A3B8;margin-bottom:12px;line-height:1.4;">
        Describe what broke. Recent page activity (without anything you typed) will be attached.
      </p>
      <div style="margin-bottom:12px;">
        <label for="bugsense-desc-input" style="font-size:11px;font-weight:600;color:#CBD5E1;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">What happened?</label>
        <textarea id="bugsense-desc-input" rows="3" maxlength="2000" placeholder="e.g. Clicking checkout threw an alert without updating my cart..." style="width:100%;box-sizing:border-box;background:#1E293B;border:1px solid #475569;border-radius:8px;padding:8px 10px;font-size:13px;color:#F8FAFC;resize:none;outline:none;font-family:inherit;"></textarea>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <div style="flex:1;">
          <label for="bugsense-severity-input" style="font-size:11px;font-weight:600;color:#CBD5E1;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Severity</label>
          <select id="bugsense-severity-input" style="width:100%;box-sizing:border-box;background:#1E293B;border:1px solid #475569;border-radius:8px;padding:7px 8px;font-size:12px;color:#F8FAFC;outline:none;">
            <option value="minor">Minor glitch</option>
            <option value="major" selected>Major defect</option>
          </select>
        </div>
        <div style="flex:1;">
          <label for="bugsense-priority-input" style="font-size:11px;font-weight:600;color:#CBD5E1;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Priority</label>
          <select id="bugsense-priority-input" style="width:100%;box-sizing:border-box;background:#1E293B;border:1px solid #475569;border-radius:8px;padding:7px 8px;font-size:12px;color:#F8FAFC;outline:none;">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button type="button" id="bugsense-cancel-btn" style="background:#334155;border:none;border-radius:8px;color:#E2E8F0;padding:8px 14px;font-size:12px;cursor:pointer;">Cancel</button>
        <button type="button" id="bugsense-submit-btn" style="background:#4F46E5;border:none;border-radius:8px;color:#FFFFFF;font-weight:600;padding:8px 16px;font-size:12px;cursor:pointer;">Send Report</button>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(modal);
    widgetNodes = [btn, modal];

    const descInput = modal.querySelector('#bugsense-desc-input');
    const submitBtn = modal.querySelector('#bugsense-submit-btn');

    function closeModal() {
      modal.style.display = 'none';
      btn.focus();
    }

    btn.onclick = function () {
      modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
      if (modal.style.display === 'block') descInput.focus();
    };
    modal.querySelector('#bugsense-close-btn').onclick = closeModal;
    modal.querySelector('#bugsense-cancel-btn').onclick = closeModal;
    // Escape closes the dialog, as it does any other.
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    submitBtn.onclick = function () {
      const desc = descInput.value.trim();
      if (!desc) {
        descInput.style.borderColor = '#EF4444';
        return;
      }
      descInput.style.borderColor = '#475569';

      submitBtn.innerText = 'Sending...';
      submitBtn.disabled = true;

      sendTelemetry({
        // A person's words, not a crash: the server files every one separately.
        kind: 'feedback',
        title: desc.slice(0, 100),
        description: desc,
        severity: modal.querySelector('#bugsense-severity-input').value,
        priority: modal.querySelector('#bugsense-priority-input').value,
      }).then(function (ok) {
        submitBtn.innerText = ok ? 'Sent ✓' : 'Failed — try again';
        setTimeout(function () {
          if (ok) {
            closeModal();
            descInput.value = '';
          }
          submitBtn.innerText = 'Send Report';
          submitBtn.disabled = false;
        }, 1200);
      });
    };
  }

  if (enableWidget) {
    if (document.readyState === 'loading') {
      listen(document, 'DOMContentLoaded', injectWidget);
    } else {
      injectWidget();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.BugSense = {
    __initialized: true,
    addBreadcrumb: function (category, message, data) {
      addBreadcrumb(category, message, data);
    },
    // The second argument is the title when it is a string (or any other
    // non-object), exactly as in earlier versions. An object is options, of
    // which `componentStack` is read, so a React error boundary can pass its
    // `info` object as it is: captureError(error, info).
    captureError: function (error, titleOrOptions) {
      const isOptions = titleOrOptions !== null && typeof titleOrOptions === 'object';
      const customTitle = titleOrOptions && !isOptions ? String(titleOrOptions) : '';
      const componentStack = isOptions && typeof titleOrOptions.componentStack === 'string' ? titleOrOptions.componentStack : '';
      const thrown = describeThrown(error);
      return sendTelemetry({
        title: customTitle || error?.message || 'Manual Error Capture',
        errorLog: thrown.errorLog,
        error: thrown.error,
        request: requestOf(error),
        componentStack,
        severity: 'major',
        priority: 'high',
      });
    },
    captureMessage: function (msg, priority) {
      return sendTelemetry({
        title: String(msg),
        description: String(msg),
        priority: priority || 'medium',
        severity: 'minor',
      });
    },
    // Restores every patched global, removes listeners and the widget. Lets a
    // single-page app mount and unmount the SDK cleanly.
    destroy: function () {
      while (cleanups.length) {
        try {
          cleanups.pop()();
        } catch (err) {
          // Keep unwinding the remaining hooks.
        }
      }
      widgetNodes.forEach(function (node) {
        node.remove();
      });
      widgetNodes = [];
      delete window.BugSense;
    },
  };
})(window, document);
