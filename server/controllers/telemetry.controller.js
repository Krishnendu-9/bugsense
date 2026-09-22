import crypto from 'crypto';
import Bug from '../models/Bug.model.js';
import { generateFingerprint } from '../utils/fingerprint.util.js';
import { clampString, toSafeText } from '../utils/sanitize.js';
import { tryConsumeTelemetryAIBudget } from '../utils/aiBudget.js';
import { dispatchWebhookAlert } from '../services/webhook.service.js';
import { analyzeError } from '../services/ai.service.js';
import { logActivity } from '../services/audit.service.js';
import { emitBugCreated, emitBugUpdated } from '../services/bugEvents.service.js';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SEVERITIES = ['minor', 'major', 'blocker'];
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
    priority: pickEnum(body.priority, PRIORITIES, 'high'),
    severity: pickEnum(body.severity, SEVERITIES, 'major'),
    browserInfo: {
      browser: clampString(browserInfo.browser, LIMITS.browserField),
      version: clampString(browserInfo.version, LIMITS.browserField),
      os: clampString(browserInfo.os, LIMITS.browserField),
      screenSize: clampString(browserInfo.screenSize, LIMITS.browserField),
      userAgent: clampString(browserInfo.userAgent, LIMITS.browserField),
    },
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

const startBackgroundAnalysis = (bug) => {
  if (!bug.errorLog || !tryConsumeTelemetryAIBudget()) return;

  analyzeError(bug.errorLog, bug.description)
    .then(async (insights) => {
      const updated = await Bug.findByIdAndUpdate(
        bug._id,
        { aiInsights: { ...insights, analyzedAt: new Date() } },
        { new: true }
      );
      if (updated) await emitBugUpdated(updated);
    })
    .catch((err) => console.warn('Background telemetry AI analysis error:', err.message));
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
    const fingerprint = generateFingerprint(report.errorLog, report.title, report.project);

    const repeat = await recordRepeat(fingerprint, report.breadcrumbs);
    if (repeat) return respondWithRepeat(res, repeat);

    let newBug;
    try {
      const now = new Date();
      newBug = await Bug.create({
        ...report,
        description: report.description || 'Automated telemetry incident reported via the BugSense SDK.',
        source: 'sdk',
        fingerprint,
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
      details: `Client SDK reported runtime incident: "${newBug.title}" (${newBug.severity})`,
    });

    startBackgroundAnalysis(newBug);

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
