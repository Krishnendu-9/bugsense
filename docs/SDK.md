# Embedding the Client SDK

`bugsense.js` is a zero-dependency agent any web app can drop in. It records the
last 15 user actions (clicks, `pushState`/`replaceState` navigation, `fetch` and
`XMLHttpRequest` calls — so axios traffic is included — and console errors) and
auto-reports uncaught errors and unhandled rejections. On request it also adds a
floating "Report Bug" widget. Reports can set priority up to `high` and severity
up to `major`; escalation to critical/blocker is left to staff.

```html
<script
  src="https://your-bugsense-host/sdk/bugsense.js"
  crossorigin="anonymous"
  data-api-url="https://your-bugsense-host"
  data-project="My Client App"
  data-key="your-ingest-key"
  data-widget="true"
></script>
```

Keep `crossorigin="anonymous"`: without it, Chromium reports nothing for
unhandled fetch rejections. If it is missing, the SDK logs one console warning
saying so.

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-api-url` | `http://localhost:5000` | Base URL of the BugSense API |
| `data-project` | `Production Web App` | Project name recorded on every incident |
| `data-widget` | off | Set to `"true"` to add the floating "Report Bug" widget |
| `data-key` | — | Ingest key, required when the server sets `TELEMETRY_INGEST_KEY`. It is visible in your page, so treat it as an identifier; `TELEMETRY_ALLOWED_ORIGINS` is what restricts who can report |

> **Upgrading from 1.4.0 or earlier:** the widget used to appear unless
> `data-widget="false"` was set. From 1.5.0 it is off unless
> `data-widget="true"` is set, so embedding the SDK never changes the host
> page by itself. Add the attribute to keep the widget.

Manual capture:

```js
window.BugSense.captureError(err, 'Checkout failed');
window.BugSense.captureMessage('Coupon banner clicked', 'low');
window.BugSense.addBreadcrumb('click', 'User opened the cart drawer');
window.BugSense.destroy(); // restore patched globals and remove the widget
```

`captureError`'s second argument is the report's title when it is a string,
as in every version. From 1.4.0 it can instead be an options object, of which
`componentStack` is read. That lets a React error boundary pass its `info`
object as it is:

```js
componentDidCatch(error, info) {
  window.BugSense.captureError(error, info); // title: error.message; component stack kept separately
}
```

From 1.4.0, reports also carry, alongside the title and stack:
- the error's name and message;
- for failed `fetch` and axios requests, the method, URL (without its query)
  and status;
- for uncaught errors, the script file, line and column;
- the component stack, if one was given;
- the SDK version.

## Widget feedback is never merged

Crashes are grouped by fingerprint: the same error from many users becomes one
bug with an occurrence count, and a fixed bug that crashes again is flagged as a
regression. Feedback typed into the widget is different: two people writing the
same words are two reports. From 1.5.0 the widget marks its reports
`kind: "feedback"`, and the server files each one as its own bug, tagged
`feedback`, never deduplicated and never flagged as a regression. (Widget
reports from older SDKs carry no kind and are still grouped like crashes.)

## Privacy

- The SDK never records form field values or text from inputs, textareas,
  selects, contenteditable regions, or anything inside an element marked
  `data-bugsense-mask`.
- A click breadcrumb names the element (tag, id, first two classes). It keeps
  visible text only when the click was on a button, link, `summary`, or an
  element with `role="button"`, `menuitem` or `tab`, and then only that
  control's label, up to 30 characters. Other page text, a table row, a profile
  card, which may show a person's name or email, is never recorded.
- Query strings and fragments are stripped from every reported URL, including
  those inside stack traces and console error messages.

## Limits

The SDK caps itself at 20 reports per page session and suppresses repeats of the
same error within 10 seconds, so a crash loop in the host page cannot flood the
ingestion endpoint. It also keeps each report within the server's limits: the
error log to 16,000 characters, the description to 5,000, and a breadcrumb's
`data` to 2,000 characters of JSON (larger data is replaced by
`{ truncated: true }`). That keeps a report small enough to send with
`keepalive`, so it still arrives when the page is closing.

Staff can try it live in the dashboard's SDK sandbox (`/sdk-demo`).
