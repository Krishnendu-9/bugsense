import Bug from '../models/Bug.model.js';
import { getIO } from '../config/socket.js';
import { generateFingerprint } from '../utils/fingerprint.util.js';
import { dispatchWebhookAlert } from '../services/webhook.service.js';
import { analyzeError } from '../services/ai.service.js';
import { logActivity } from '../services/audit.service.js';

/**
 * Controller: Public telemetry ingestion endpoint for the client SDK (`bugsense.js`)
 */
export const reportTelemetry = async (req, res) => {
  const {
    title,
    errorLog = '',
    description = '',
    breadcrumbs = [],
    browserInfo = {},
    project = 'Web Client',
    priority = 'high',
    severity = 'major',
    source = 'sdk',
  } = req.body;

  if (!title && !errorLog) {
    return res.status(400).json({ message: 'Title or errorLog is required for telemetry reporting' });
  }

  try {
    const bugTitle = title || (errorLog.split('\n')[0] || 'Uncaught Client Exception').slice(0, 150);
    const fingerprint = generateFingerprint(errorLog, bugTitle, project);

    if (fingerprint) {
      const existing = await Bug.findOne({ fingerprint });
      if (existing) {
        existing.occurrences = (existing.occurrences || 1) + 1;
        existing.lastSeenAt = new Date();

        let eventType = 'updated';
        if (existing.status === 'resolved' || existing.status === 'closed') {
          existing.status = 'in-progress';
          existing.statusHistory.push({
            status: 'in-progress',
            changedAt: new Date(),
            note: 'Regression auto-detected: error re-occurred in production telemetry.',
          });
          eventType = 'regression';
        }

        if (breadcrumbs && breadcrumbs.length > 0) {
          existing.breadcrumbs = breadcrumbs;
        }

        await existing.save();

        getIO().emit('bug:updated', existing);
        getIO().to(`bug:${existing._id}`).emit('bug:detail:updated', existing);
        dispatchWebhookAlert(existing, eventType);

        logActivity({
          action: eventType === 'regression' ? 'REGRESSION_DETECTED' : 'SDK_TELEMETRY',
          entityType: 'telemetry',
          entityId: existing._id,
          performedByName: 'Telemetry Pipeline',
          details: eventType === 'regression'
            ? `Telemetry regression: "${existing.title}" re-occurred (${existing.occurrences}x)`
            : `Deduplicated incident #${existing._id.toString().slice(-6)}: occurred ${existing.occurrences}x`,
        });

        return res.status(200).json({
          success: true,
          status: 'deduplicated',
          bugId: existing._id,
          occurrences: existing.occurrences,
        });
      }
    }

    // Create new incident
    const newBug = await Bug.create({
      title: bugTitle,
      description: description || `Automated telemetry incident reported via ${source} SDK.`,
      errorLog,
      browserInfo: {
        browser: browserInfo.browser || '',
        version: browserInfo.version || '',
        os: browserInfo.os || '',
        screenSize: browserInfo.screenSize || '',
        userAgent: browserInfo.userAgent || req.headers['user-agent'] || '',
      },
      breadcrumbs,
      project,
      priority,
      severity,
      source,
      fingerprint,
      occurrences: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      status: 'open',
    });

    getIO().emit('bug:created', newBug);
    dispatchWebhookAlert(newBug, 'created');

    logActivity({
      action: 'SDK_TELEMETRY',
      entityType: 'telemetry',
      entityId: newBug._id,
      performedByName: 'BugSense SDK',
      details: `Client SDK reported runtime incident: "${newBug.title}" (${newBug.severity})`,
    });

    // Asynchronously kick off AI auto-analysis in background
    if (errorLog) {
      analyzeError(errorLog, newBug.description)
        .then(async (insights) => {
          if (insights?.possibleCause) {
            newBug.aiInsights = {
              possibleCause: insights.possibleCause,
              suggestedFix: insights.suggestedFix,
              analyzedAt: new Date(),
            };
            await newBug.save();
            getIO().to(`bug:${newBug._id}`).emit('bug:detail:updated', newBug);
          }
        })
        .catch((err) => console.warn('Background telemetry AI analysis error:', err.message));
    }

    return res.status(201).json({
      success: true,
      status: 'created',
      bugId: newBug._id,
      occurrences: 1,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
