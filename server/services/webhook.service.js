import User from '../models/User.model.js';
import { isAllowedWebhookUrl } from '../utils/webhookUrl.js';

const PRIORITY_COLORS = {
  critical: 0x7c3aed, // Purple
  high: 0xef4444, // Red
  medium: 0xf59e0b, // Amber
  low: 0x22c55e, // Green
};

const buildDiscordPayload = (bug, eventType, bugUrl) => {
  const titlePrefix = eventType === 'regression' ? '🚨 [REGRESSION]' : '🐛 [NEW BUG]';
  return {
    username: 'BugSense Observability',
    embeds: [
      {
        title: `${titlePrefix} ${bug.title}`.slice(0, 256),
        url: bugUrl,
        description: bug.description?.replace(/<[^>]*>?/gm, '').slice(0, 250) || 'No description provided.',
        color: PRIORITY_COLORS[bug.priority] || 0x6366f1,
        fields: [
          { name: 'Priority', value: bug.priority?.toUpperCase() || 'MEDIUM', inline: true },
          { name: 'Severity', value: bug.severity?.toUpperCase() || 'MINOR', inline: true },
          { name: 'Occurrences', value: `Seen ${bug.occurrences || 1} time(s)`, inline: true },
          { name: 'Source', value: bug.source || 'manual', inline: true },
          { name: 'Project', value: bug.project || 'General', inline: true },
          { name: 'Status', value: bug.status || 'open', inline: true },
        ],
        footer: { text: 'BugSense Incident Hub' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
};

const buildSlackPayload = (bug, eventType, bugUrl) => {
  const titlePrefix = eventType === 'regression' ? '🚨 [REGRESSION]' : '🐛 [NEW BUG]';
  return {
    text: `${titlePrefix} *${bug.title}*\nPriority: \`${bug.priority}\` | Severity: \`${bug.severity}\` | Occurrences: \`${bug.occurrences || 1}\`\n<${bugUrl}|View Bug in BugSense>`,
  };
};

const post = async (type, url, payload) => {
  if (!isAllowedWebhookUrl(type, url)) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn(`${type} webhook dispatch error (non-fatal):`, err.message);
  }
};

// Per-user preferences from the Profile page: "critical" alerts cover newly
// reported critical-priority incidents, "regression" alerts cover resolved
// incidents that re-occur.
const userWantsAlert = (webhooks, bug, eventType) => {
  if (eventType === 'regression') return webhooks.alertOnRegression !== false;
  if (eventType === 'created') return webhooks.alertOnCritical !== false && bug.priority === 'critical';
  return false;
};

/**
 * Sends incident alerts for new and regressed bugs. Plain repeat occurrences do
 * not alert — a crash loop would otherwise flood every channel.
 */
export const dispatchWebhookAlert = async (bug, eventType = 'created') => {
  if (eventType !== 'created' && eventType !== 'regression') return;

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const bugUrl = `${clientUrl}/bugs/${bug._id}`;
  const discordPayload = buildDiscordPayload(bug, eventType, bugUrl);
  const slackPayload = buildSlackPayload(bug, eventType, bugUrl);

  const targets = [];

  // Workspace-wide channels configured by the operator receive every alert.
  if (process.env.DISCORD_WEBHOOK_URL) targets.push(['discord', process.env.DISCORD_WEBHOOK_URL]);
  if (process.env.SLACK_WEBHOOK_URL) targets.push(['slack', process.env.SLACK_WEBHOOK_URL]);

  try {
    const users = await User.find({
      $or: [{ 'webhooks.discordUrl': { $nin: ['', null] } }, { 'webhooks.slackUrl': { $nin: ['', null] } }],
    }).select('webhooks');

    for (const { webhooks } of users) {
      if (!webhooks || !userWantsAlert(webhooks, bug, eventType)) continue;
      if (webhooks.discordUrl) targets.push(['discord', webhooks.discordUrl]);
      if (webhooks.slackUrl) targets.push(['slack', webhooks.slackUrl]);
    }
  } catch (err) {
    console.warn('Could not load user webhook settings (non-fatal):', err.message);
  }

  // The same channel may be configured by several users; alert it once.
  const unique = new Map(targets.map(([type, url]) => [`${type}:${url}`, [type, url]]));

  await Promise.all(
    [...unique.values()].map(([type, url]) =>
      post(type, url, type === 'discord' ? discordPayload : slackPayload)
    )
  );
};
