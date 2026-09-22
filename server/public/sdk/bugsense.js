/**
 * BugSense Client SDK & Observability Telemetry Agent (v1.1.0)
 * Embed in any website:
 * <script src="https://your-bugsense-host/sdk/bugsense.js"
 *         data-api-url="https://your-bugsense-host"
 *         data-project="My Client App"
 *         data-key="optional-ingest-key"></script>
 *
 * Privacy: the SDK never records form field values, and strips query strings
 * and fragments from every URL it reports, since those commonly carry tokens.
 */
(function (window, document) {
  'use strict';

  // Loading the script twice would wrap fetch/console twice and double-report.
  if (window.BugSense && window.BugSense.__initialized) return;

  // Read configuration from current script tag
  const currentScript = document.currentScript || Array.from(document.querySelectorAll('script')).pop();
  const apiUrl = (currentScript?.getAttribute('data-api-url') || 'http://localhost:5000').replace(/\/+$/, '');
  const project = currentScript?.getAttribute('data-project') || 'Production Web App';
  const ingestKey = currentScript?.getAttribute('data-key') || '';
  const enableWidget = currentScript?.getAttribute('data-widget') !== 'false';

  const MAX_BREADCRUMBS = 15;
  const MAX_TITLE_LENGTH = 200;
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
  function addBreadcrumb(category, message, data) {
    breadcrumbs.push({
      timestamp: new Date().toISOString(),
      category,
      message: clamp(message, 300),
      data: data || {},
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

  // 1. DOM clicks — element identity only, never typed content
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
        const text = isSensitiveElement(target) ? '' : (target.innerText || '').trim().slice(0, 30);
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

  // 2. History navigation
  const originalPushState = window.history.pushState;
  if (originalPushState) {
    window.history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      const newUrl = redactUrl(arguments[2] || window.location.href);
      addBreadcrumb('navigation', 'Navigated to ' + newUrl, { url: newUrl });
      return result;
    };
    cleanups.push(function () {
      window.history.pushState = originalPushState;
    });
  }
  listen(window, 'popstate', function () {
    const url = redactUrl(window.location.href);
    addBreadcrumb('navigation', 'Browser back/forward to ' + url, { url });
  });

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

  // 4. Console errors
  const originalConsoleError = console.error;
  console.error = function () {
    try {
      const msg = Array.from(arguments).map(describeArg).join(' ');
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

    const fullPayload = Object.assign({}, payload, {
      title: clamp(payload.title, MAX_TITLE_LENGTH),
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
    return send(apiUrl + '/api/telemetry/report', {
      method: 'POST',
      headers,
      body: safeStringify(fullPayload),
      keepalive: true,
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
  listen(window, 'error', function (event) {
    // Resource load errors (img/script 404s) bubble here without an Error.
    if (!event.message && !event.error) return;
    const errorLog = event.error?.stack || event.message + ' at ' + redactUrl(event.filename) + ':' + event.lineno + ':' + event.colno;
    addBreadcrumb('error', 'Crash: ' + event.message, {});

    sendTelemetry({
      title: event.message || 'Uncaught JavaScript Error',
      errorLog,
      description: 'Auto-captured crash on ' + redactUrl(window.location.href),
      severity: 'major',
      priority: 'high',
    });
  });

  listen(window, 'unhandledrejection', function (event) {
    const reason = event.reason;
    const errorLog = reason?.stack || describeArg(reason);
    const title = 'Unhandled Promise Rejection: ' + clamp(reason?.message || describeArg(reason), 150);
    addBreadcrumb('error', title, {});

    sendTelemetry({
      title,
      errorLog,
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
            <option value="blocker">Blocker / Crash</option>
          </select>
        </div>
        <div style="flex:1;">
          <label for="bugsense-priority-input" style="font-size:11px;font-weight:600;color:#CBD5E1;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Priority</label>
          <select id="bugsense-priority-input" style="width:100%;box-sizing:border-box;background:#1E293B;border:1px solid #475569;border-radius:8px;padding:7px 8px;font-size:12px;color:#F8FAFC;outline:none;">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
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
    }

    btn.onclick = function () {
      modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
      if (modal.style.display === 'block') descInput.focus();
    };
    modal.querySelector('#bugsense-close-btn').onclick = closeModal;
    modal.querySelector('#bugsense-cancel-btn').onclick = closeModal;

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
    captureError: function (error, customTitle) {
      return sendTelemetry({
        title: customTitle || error?.message || 'Manual Error Capture',
        errorLog: error?.stack || String(error),
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
