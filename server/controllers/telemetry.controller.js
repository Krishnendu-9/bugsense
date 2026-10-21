import crypto from 'crypto';
import Bug from '../models/Bug.model.js';
import { generateFingerprintV2 } from '../utils/fingerprint.util.js';
import { clampString, toSafeText } from '../utils/sanitize.js';
import { tryConsumeTelemetryAIBudget } from '../utils/aiBudget.js';
import { dispatchWebhookAlert } from '../services/webhook.service.js';
import { queueAutoAnalysis } from '../services/autoAnalysis.service.js';
import { logActivity } from '../services/audit.service.js';
import { emitBugCreated, emitBugUpdated } from '../services/bugEvents.service.js';

// The endpoint is public, so reports cannot claim the top levels: 'critical'
// and 'blocker' page every alert channel. An SDK report tops out at high/major
// and staff escalate it after triage.
const SDK_PRIORITIES = ['low', 'medium', 'high'];
const SDK_SEVERITIES = ['minor', 'major'];
const BREADCRUMB_CATEGORIES = ['click', 'navigation', 'xhr', 'console', 'error'];

const LIMITS = {
  title: 200,
  description: 5000,
  errorLog: 20000,
  project: 100,
  browserField: 500,
  breadcrumbs: 30,
  breadcrumbMessage: 500,
  breadcrumbData: 2000,
  // Fields from SDK 1.4.0 (docs/fingerprint-eval-v2.md, Amendment 1, P15).
  // error.message feeds the v2 key's normaliser, whose worst case grows with
  // the square of its length; 1,000 characters keeps it to a few milliseconds.
  errorName: 100,
  errorMessage: 1000,
  requestMethod: 16,
  requestUrl: 2000,
  filename: 2000,
  componentStack: 5000,
  sdkVersion: 32,
};

// The SDK 1.4.0 fields arrive from a public endpoint, so each is shape-checked:
// a value of the wrong type becomes null or empty, and never fails the report.
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stringOrEmpty = (value, max) => (typeof value === 'string' ? clampString(value, max) : '');
const positionOrNull = (value) => (Number.isInteger(value) && value >= 0 && value <= 1e9 ? value : null);

// { name, message }; null when absent or when message is not a string, so the
// key falls back to the title as it does for older SDKs.
const normalizeError = (error) => {
  if (!isPlainObject(error) || typeof error.message !== 'string') return null;
  return {
    name: typeof error.name === 'string' ? clampString(error.name, LIMITS.errorName) : null,
    message: clampString(error.message, LIMITS.errorMessage),
  };
};

const normalizeRequest = (request) => {
  if (!isPlainObject(request) || typeof request.url !== 'string') return null;
  const { status } = request;
  return {
    method: stringOrEmpty(request.method, LIMITS.requestMethod),
    url: clampString(request.url, LIMITS.requestUrl),
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
  };
};

const normalizeSource = (source) => {
  if (!isPlainObject(source)) return null;
  return {
    filename: stringOrEmpty(source.filename, LIMITS.filename),
    lineno: positionOrNull(source.lineno),
    colno: positionOrNull(source.colno),
  };
};

/**
 * Optional shared secret for the ingest endpoint. When TELEMETRY_INGEST_KEY is
 * set, reports must carry it in the X-BugSense-Key header (the SDK reads it from
 * its data-key attribute). Without it the endpoint stays open for local demos.
 */
export const requireIngestKey = (req, res, next) => {
  const expected = process.env.TELEMETRY_INGEST_KEY;
  if (!expected) return next();

  const provided = req.get('x-bugsense-key') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();

  return res.status(401).json({ message: 'Invalid or missing telemetry ingest key' });
};

const pickEnum = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

const toValidDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

// Breadcrumb `data` is free-form, so it is size-capped and stripped of keys that
// MongoDB would interpret as operators.
const sanitizeBreadcrumbData = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  try {
    const json = JSON.stringify(data, (key, value) => (key.startsWith('$') || key.includes('.') ? undefined : value));
    return json && json.length <= LIMITS.breadcrumbData ? JSON.parse(json) : {};
  } catch {
    return {};
  }
};

const normalizeBreadcrumbs = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-LIMITS.breadcrumbs).map((crumb) => ({
    timestamp: toValidDate(crumb?.timestamp),
    category: pickEnum(crumb?.category, BREADCRUMB_CATEGORIES, 'console'),
    message: clampString(crumb?.message, LIMITS.breadcrumbMessage),
    data: sanitizeBreadcrumbData(crumb?.data),
  }));
};

const normalizeReport = (body = {}) => {
  const errorLog = clampString(body.errorLog, LIMITS.errorLog);
  const firstLine = errorLog.split('\n')[0]?.trim();
  const browserInfo = body.browserInfo && typeof body.browserInfo === 'object' ? body.browserInfo : {};

  return {
    title: clampString(body.title || firstLine || 'Uncaught Client Exception', LIMITS.title),
    // Plain text from an unauthenticated source: tags are stripped because the
    // description slot is rendered as HTML in the dashboard.
    description: toSafeText(clampString(body.description, LIMITS.description)),
    errorLog,
    breadcrumbs: normalizeBreadcrumbs(body.breadcrumbs),
    project: clampString(body.project || 'Web Client', LIMITS.project),
    priority: pickEnum(body.priority, SDK_PRIORITIES, 'high'),
    severity: pickEnum(body.severity, SDK_SEVERITIES, 'major'),
    browserInfo: {
      browser: clampString(browserInfo.browser, LIMITS.browserField),
      version: clampString(browserInfo.version, LIMITS.browserField),
      os: clampString(browserInfo.os, LIMITS.browserField),
      screenSize: clampString(browserInfo.screenSize, LIMITS.browserField),
      userAgent: clampString(browserInfo.userAgent, LIMITS.browserField),
    },
    // Absent from older SDKs' reports, which therefore read as before.
    sdkVersion: stringOrEmpty(body.sdkVersion, LIMITS.sdkVersion),
    error: normalizeError(body.error),
    request: normalizeRequest(body.request),
    source: normalizeSource(body.source),
    componentStack: stringOrEmpty(body.componentStack, LIMITS.componentStack),
  };
};

// Records one more occurrence of a known incident. Both updates are single
// atomic statements, so concurrent reports never lose counts and a regression
// is flagged exactly once.
const recordRepeat = async (fingerprint, breadcrumbs) => {
  const now = new Date();
  const update = { $inc: { occurrences: 1 }, $set: { lastSeenAt: now } };
  if (breadcrumbs.length) update.$set.breadcrumbs = breadcrumbs;

  const existing = await Bug.findOneAndUpdate({ fingerprint, source: 'sdk' }, update, { new: true });
  if (!existing) return null;

  const regressed = await Bug.findOneAndUpdate(
    { _id: existing._id, status: { $in: ['resolved', 'closed'] } },
    {
      $set: { status: 'in-progress' },
      $push: {
        statusHistory: {
          status: 'in-progress',
          changedAt: now,
          note: 'Regression auto-detected: error re-occurred in production telemetry.',
        },
      },
    },
    { new: true }
  );

  return { bug: regressed || existing, isRegression: Boolean(regressed) };
};

const respondWithRepeat = async (res, { bug, isRegression }) => {
  await emitBugUpdated(bug);

  if (isRegression) {
    dispatchWebhookAlert(bug, 'regression');
    logActivity({
      action: 'REGRESSION_DETECTED',
      entityType: 'telemetry',
      entityId: bug._id,
      performedByName: 'Telemetry Pipeline',
      details: `Telemetry regression: "${bug.title}" re-occurred (${bug.occurrences}x)`,
    });
  }

  return res.status(200).json({
    success: true,
    status: 'deduplicated',
    bugId: bug._id,
    occurrences: bug.occurrences,
  });
};

/**
 * Controller: Public telemetry ingestion endpoint for the client SDK (`bugsense.js`)
 */
export const reportTelemetry = async (req, res, next) => {
  if (!req.body?.title && !req.body?.errorLog) {
    return res.status(400).json({ message: 'Title or errorLog is required for telemetry reporting' });
  }

  try {
    const report = normalizeReport(req.body);
    // The v2 key (docs/fingerprint-eval-v2.md, section 2). It reads project,
    // title, errorLog, breadcrumbs and, from SDK 1.4.0, error, request and
    // source; older SDKs' reports go through its fallbacks.
    const fingerprint = generateFingerprintV2(report);

    const repeat = await recordRepeat(fingerprint, report.breadcrumbs);
    if (repeat) return respondWithRepeat(res, repeat);

    let newBug;
    try {
      const now = new Date();
      // sdkVersion is read, not stored; error is stored as its two fields; and
      // the SDK's `source` (where in a script the error was thrown) is stored
      // as errorLocation, since a bug's `source` says where the report came from.
      const { sdkVersion: _sdkVersion, error, source: errorLocation, ...stored } = report;
      newBug = await Bug.create({
        ...stored,
        errorName: error ? error.name : null,
        errorMessage: error ? error.message : null,
        errorLocation,
        // Empty when the SDK sent none. (Records created before this change
        // hold the old placeholder sentence; the client hides that one too.)
        description: report.description || '',
        source: 'sdk',
        fingerprint,
        fingerprintVersion: 2,
        occurrences: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        status: 'open',
      });
    } catch (err) {
      // Another request created this incident between our lookup and insert;
      // the unique index rejected the duplicate, so count this one as a repeat.
      if (err?.code === 11000) {
        const raced = await recordRepeat(fingerprint, report.breadcrumbs);
        if (raced) return respondWithRepeat(res, raced);
      }
      throw err;
    }

    await emitBugCreated(newBug);
    dispatchWebhookAlert(newBug, 'created');
    logActivity({
      action: 'SDK_TELEMETRY',
      entityType: 'telemetry',
      entityId: newBug._id,
      performedByName: 'BugSense SDK',
      details: `SDK reported a crash: "${newBug.title}" (${newBug.severity})`,
    });

    queueAutoAnalysis(newBug, tryConsumeTelemetryAIBudget);

    return res.status(201).json({
      success: true,
      status: 'created',
      bugId: newBug._id,
      occurrences: 1,
    });
  } catch (err) {
    return next(err);
  }
};
