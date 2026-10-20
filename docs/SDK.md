# Embedding the Client SDK

`bugsense.js` is a zero-dependency agent any web app can drop in. It records the
last 15 user actions (clicks, `pushState`/`replaceState` navigation, `fetch` and
`XMLHttpRequest` calls — so axios traffic is included — and console errors),
auto-reports uncaught errors and unhandled rejections, and injects a floating
"Report Bug" widget. Reports can set priority up to `high` and severity up to
`major`; escalation to critical/blocker is left to staff.

```html
<script
  src="https://your-bugsense-host/sdk/bugsense.js"
  crossorigin="anonymous"
  data-api-url="https://your-bugsense-host"
  data-project="My Client App"
  data-key="your-ingest-key"
></script>
```

Keep `crossorigin="anonymous"`: without it, Chromium reports nothing for
unhandled fetch rejections. If it is missing, the SDK logs one console warning
saying so.

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-api-url` | `http://localhost:5000` | Base URL of the BugSense API |
| `data-project` | `Production Web App` | Project name recorded on every incident |
| `data-widget` | `true` | Set to `"false"` to suppress the floating report pill |
| `data-key` | — | Ingest key, required when the server sets `TELEMETRY_INGEST_KEY`. It is visible in your page, so treat it as an identifier; `TELEMETRY_ALLOWED_ORIGINS` is what restricts who can report |

Manual capture:

```js
window.BugSense.captureError(err, 'Checkout failed');
window.BugSense.captureMessage('Coupon banner clicked', 'low');
window.BugSense.addBreadcrumb('click', 'User opened the cart drawer');
window.BugSense.destroy(); // restore patched globals and remove the widget
```

**Privacy:** the SDK never records form field values or text from inputs,
textareas, selects, contenteditable regions, or anything inside an element
marked `data-bugsense-mask`. Query strings and fragments are stripped from every
reported URL, including those inside stack traces.

The SDK caps itself at 20 reports per page session and suppresses repeats of the
same error within 10 seconds, so a crash loop in the host page cannot flood the
ingestion endpoint. Try it live at `/sdk-demo`.
