/**
 * BugSense Client SDK & Observability Telemetry Agent (v1.0.0)
 * Embed in any website:
 * <script src="http://localhost:5000/sdk/bugsense.js" data-api-url="http://localhost:5000" data-project="My Client App"></script>
 */
(function (window, document) {
  'use strict';

  // Read configuration from current script tag
  const currentScript = document.currentScript || Array.from(document.querySelectorAll('script')).pop();
  const apiUrl = currentScript?.getAttribute('data-api-url') || 'http://localhost:5000';
  const project = currentScript?.getAttribute('data-project') || 'Production Web App';
  const enableWidget = currentScript?.getAttribute('data-widget') !== 'false';

  // In-memory Flight Recorder Breadcrumbs ring buffer (last 15 actions)
  const breadcrumbs = [];
  function addBreadcrumb(category, message, data = {}) {
    breadcrumbs.push({
      timestamp: new Date().toISOString(),
      category,
      message,
      data,
    });
    if (breadcrumbs.length > 15) {
      breadcrumbs.shift();
    }
  }

  // Initial Breadcrumb: Page loaded
  addBreadcrumb('navigation', `Page loaded: ${window.location.pathname}${window.location.search}`, {
    url: window.location.href,
  });

  // 1. Intercept DOM Clicks
  document.addEventListener(
    'click',
    function (e) {
      try {
        const target = e.target;
        if (!target) return;
        const tag = target.tagName ? target.tagName.toLowerCase() : 'element';
        const id = target.id ? `#${target.id}` : '';
        const cls = target.className && typeof target.className === 'string' ? `.${target.className.split(' ').slice(0, 2).join('.')}` : '';
        const text = (target.innerText || target.value || '').slice(0, 30).trim();
        const snippet = text ? ` "${text}"` : '';

        addBreadcrumb('click', `Clicked <${tag}${id}${cls}>${snippet}`, {
          tag,
          id: target.id || null,
        });
      } catch (err) {}
    },
    true
  );

  // 2. Intercept History Navigation
  const originalPushState = window.history.pushState;
  if (originalPushState) {
    window.history.pushState = function () {
      originalPushState.apply(this, arguments);
      const newUrl = arguments[2] || window.location.pathname;
      addBreadcrumb('navigation', `Navigated to ${newUrl}`, { url: String(newUrl) });
    };
  }
  window.addEventListener('popstate', function () {
    addBreadcrumb('navigation', `Browser back/forward to ${window.location.pathname}`, {
      url: window.location.href,
    });
  });

  // 3. Intercept Fetch API calls
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function () {
      const url = typeof arguments[0] === 'string' ? arguments[0] : arguments[0]?.url || 'unknown';
      const method = arguments[1]?.method || 'GET';
      try {
        const response = await originalFetch.apply(this, arguments);
        addBreadcrumb('xhr', `API [${method.toUpperCase()}] ${url} (HTTP ${response.status})`, {
          method,
          status: response.status,
          url,
        });
        return response;
      } catch (err) {
        addBreadcrumb('xhr', `API [${method.toUpperCase()}] ${url} (FAILED)`, {
          method,
          error: err.message,
          url,
        });
        throw err;
      }
    };
  }

  // 4. Intercept Console Errors & Warnings
  const originalConsoleError = console.error;
  console.error = function () {
    const msg = Array.from(arguments).map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    addBreadcrumb('console', `Console Error: ${msg.slice(0, 120)}`, { raw: msg });
    originalConsoleError.apply(console, arguments);
  };

  // Guardrails: a render loop can fire window.onerror continuously. Cap the
  // number of reports per page session and suppress repeats of an error we
  // have already reported, so a broken host page cannot flood the ingest API.
  const MAX_REPORTS_PER_SESSION = 20;
  const REPEAT_SUPPRESSION_MS = 10000;
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

  // Helper to send telemetry
  function sendTelemetry(payload) {
    if (!shouldSend(payload)) return;

    const fullPayload = {
      ...payload,
      project,
      breadcrumbs: [...breadcrumbs],
      browserInfo: {
        browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Browser',
        version: navigator.appVersion?.slice(0, 20) || 'Unknown',
        os: navigator.platform || 'Unknown OS',
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
    };

    // Use the unpatched fetch: routing through our own wrapper would record an
    // xhr breadcrumb for every report the SDK itself sends.
    const send = originalFetch ? originalFetch.bind(window) : window.fetch.bind(window);
    send(`${apiUrl}/api/telemetry/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullPayload),
    }).catch(function (err) {
      console.warn('[BugSense SDK] Failed to send telemetry report:', err);
    });
  }

  // 5. Global Error Handlers (Auto-telemetry on unhandled crashes)
  window.addEventListener('error', function (event) {
    const errorLog = event.error?.stack || `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
    addBreadcrumb('error', `Crash: ${event.message}`, { errorLog });

    sendTelemetry({
      title: event.message || 'Uncaught JavaScript Error',
      errorLog,
      description: `Auto-captured crash on ${window.location.pathname}`,
      severity: 'major',
      priority: 'high',
      source: 'sdk',
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    const errorLog = reason?.stack || (typeof reason === 'object' ? JSON.stringify(reason) : String(reason));
    const title = `Unhandled Promise Rejection: ${reason?.message || String(reason).slice(0, 80)}`;
    addBreadcrumb('error', title, { errorLog });

    sendTelemetry({
      title,
      errorLog,
      description: `Unhandled async promise failure on ${window.location.pathname}`,
      severity: 'major',
      priority: 'high',
      source: 'sdk',
    });
  });

  // 6. In-App Floating Bug Feedback Widget
  if (enableWidget) {
    window.addEventListener('DOMContentLoaded', function () {
      injectWidget();
    });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      injectWidget();
    }
  }

  let widgetInjected = false;
  function injectWidget() {
    if (widgetInjected) return;
    widgetInjected = true;

    // Trigger Pill Button
    const btn = document.createElement('button');
    btn.id = 'bugsense-floating-pill';
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
    modal.style.cssText = `
      display: none;
      position: fixed;
      bottom: 80px;
      right: 24px;
      z-index: 999999;
      width: 360px;
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
        <button id="bugsense-close-btn" style="background:none;border:none;color:#94A3B8;cursor:pointer;font-size:18px;line-height:1;">✕</button>
      </div>
      <p style="font-size:12px;color:#94A3B8;margin-bottom:12px;line-height:1.4;">
        Describe what broke. Flight Recorder breadcrumbs and diagnostic telemetry will automatically attach.
      </p>
      <div style="margin-bottom:12px;">
        <label style="font-size:11px;font-weight:600;color:#CBD5E1;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">What happened?</label>
        <textarea id="bugsense-desc-input" rows="3" placeholder="e.g. Clicking checkout threw an alert without updating my cart..." style="width:100%;box-sizing:border-box;background:#1E293B;border:1px solid #475569;border-radius:8px;padding:8px 10px;font-size:13px;color:#F8FAFC;resize:none;outline:none;font-family:inherit;"></textarea>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <div style="flex:1;">
          <label style="font-size:11px;font-weight:600;color:#CBD5E1;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Severity</label>
          <select id="bugsense-severity-input" style="width:100%;box-sizing:border-box;background:#1E293B;border:1px solid #475569;border-radius:8px;padding:7px 8px;font-size:12px;color:#F8FAFC;outline:none;">
            <option value="minor">Minor glitch</option>
            <option value="major" selected>Major defect</option>
            <option value="blocker">Blocker / Crash</option>
          </select>
        </div>
        <div style="flex:1;">
          <label style="font-size:11px;font-weight:600;color:#CBD5E1;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Priority</label>
          <select id="bugsense-priority-input" style="width:100%;box-sizing:border-box;background:#1E293B;border:1px solid #475569;border-radius:8px;padding:7px 8px;font-size:12px;color:#F8FAFC;outline:none;">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button id="bugsense-cancel-btn" style="background:#334155;border:none;border-radius:8px;color:#E2E8F0;padding:8px 14px;font-size:12px;cursor:pointer;">Cancel</button>
        <button id="bugsense-submit-btn" style="background:#4F46E5;border:none;border-radius:8px;color:#FFFFFF;font-weight:600;padding:8px 16px;font-size:12px;cursor:pointer;">Send Report</button>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(modal);

    btn.onclick = function () {
      modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
    };

    document.getElementById('bugsense-close-btn').onclick = function () {
      modal.style.display = 'none';
    };
    document.getElementById('bugsense-cancel-btn').onclick = function () {
      modal.style.display = 'none';
    };

    document.getElementById('bugsense-submit-btn').onclick = function () {
      const descInput = document.getElementById('bugsense-desc-input');
      const desc = descInput.value.trim();
      if (!desc) {
        descInput.style.borderColor = '#EF4444';
        return;
      }

      const severity = document.getElementById('bugsense-severity-input').value;
      const priority = document.getElementById('bugsense-priority-input').value;
      const submitBtn = document.getElementById('bugsense-submit-btn');

      submitBtn.innerText = 'Sending...';
      submitBtn.disabled = true;

      sendTelemetry({
        title: desc.slice(0, 100),
        description: desc,
        severity,
        priority,
        source: 'sdk',
      });

      setTimeout(function () {
        submitBtn.innerText = 'Sent ✓';
        setTimeout(function () {
          modal.style.display = 'none';
          descInput.value = '';
          submitBtn.innerText = 'Send Report';
          submitBtn.disabled = false;
        }, 1000);
      }, 500);
    };
  }

  // Expose global namespace
  window.BugSense = {
    addBreadcrumb,
    captureError: function (error, customTitle) {
      const errorLog = error?.stack || String(error);
      sendTelemetry({
        title: customTitle || error?.message || 'Manual Error Capture',
        errorLog,
        severity: 'major',
        priority: 'high',
        source: 'sdk',
      });
    },
    captureMessage: function (msg, priority = 'medium') {
      sendTelemetry({
        title: msg,
        description: msg,
        priority,
        severity: 'minor',
        source: 'sdk',
      });
    },
  };
})(window, document);
