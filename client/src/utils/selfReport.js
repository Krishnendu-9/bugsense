import { getApiOrigin, getBrowserInfo } from './helpers.js';

// BugSense reports its own crashes to its own telemetry endpoint, as project
// "BugSense Dashboard", so they show up in the app like any customer's would.
// This posts directly instead of loading the SDK: the SDK patches globals,
// which would clash with the SDK Playground page loading and unloading it.
//
// On in production builds; VITE_SELF_REPORT=false turns it off and
// VITE_SELF_REPORT=true turns it on in development.
const MAX_REPORTS_PER_SESSION = 5;
const reported = new Set();

export const isSelfReportEnabled = () => {
  const flag = import.meta.env.VITE_SELF_REPORT;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return Boolean(import.meta.env.PROD);
};

/** Sends one crash report. Resolves to true when the server accepted it. */
export const reportClientError = async (error, componentStack = '') => {
  if (!isSelfReportEnabled()) return false;

  const message = error?.message || String(error);
  const key = `${error?.name}:${message}`;
  if (reported.has(key) || reported.size >= MAX_REPORTS_PER_SESSION) return false;
  reported.add(key);

  const headers = { 'Content-Type': 'application/json' };
  const ingestKey = import.meta.env.VITE_TELEMETRY_INGEST_KEY;
  if (ingestKey) headers['X-BugSense-Key'] = ingestKey;

  const errorLog = [error?.stack || `${error?.name || 'Error'}: ${message}`, componentStack && `Component stack:${componentStack}`]
    .filter(Boolean)
    .join('\n\n');

  try {
    const res = await fetch(`${getApiOrigin()}/api/telemetry/report`, {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({
        title: `${error?.name || 'Error'}: ${message}`.slice(0, 200),
        errorLog: errorLog.slice(0, 20000),
        // Path only: query strings and fragments can carry tokens.
        description: `Render crash in the BugSense dashboard on ${window.location.pathname}`,
        project: 'BugSense Dashboard',
        priority: 'high',
        severity: 'major',
        browserInfo: getBrowserInfo(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
};
