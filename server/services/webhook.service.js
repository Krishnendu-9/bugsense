import User from '../models/User.model.js';
import { isAllowedWebhookUrl } from '../utils/webhookUrl.js';
import { getPrimaryClientUrl } from '../utils/clientOrigins.js';
import { htmlToText } from '../utils/sanitize.js';

const PRIORITY_COLORS = {
  critical: 0x7c3aed, // Purple
  high: 0xef4444, // Red
  medium: 0xf59e0b, // Amber
  low: 0x22c55e, // Green
};

const TITLE_PREFIXES = {
  created: '🐛 [NEW BUG]',
  regression: '🚨 [REGRESSION]',
  escalated: '⚠️ [ESCALATED]',
};

// Slack reads <...> as links and mentions (<!channel>, <@U123>) and & as the
// start of an entity, so report text must have all three escaped. Titles can
// come from the public SDK endpoint.
export const escapeSlack = (text) =>
  String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const buildDiscordPayload = (bug, eventType, bugUrl) => {
  const titlePrefix = TITLE_PREFIXES[eventType] || TITLE_PREFIXES.created;
  return {
    username: 'BugSense',
    // Embeds do not ping today; this keeps report text from ever mentioning
    // @everyone or a role should a field move into `content`.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `${titlePrefix} ${bug.title}`.slice(0, 256),
        url: bugUrl,
        description: htmlToText(bug.description).slice(0, 250) || 'No description provided.',
        color: PRIORITY_COLORS[bug.priority] || 0x6366f1,
        fields: [
          { name: 'Priority', value: bug.priority?.toUpperCase() || 'MEDIUM', inline: true },
          { name: 'Severity', value: bug.severity?.toUpperCase() || 'MINOR', inline: true },
          { name: 'Occurrences', value: `Seen ${bug.occurrences || 1} time(s)`, inline: true },
          { name: 'Source', value: bug.source || 'manual', inline: true },
          { name: 'Project', value: bug.project || 'General', inline: true },
          { name: 'Status', value: bug.status || 'open', inline: true },
        ],
        footer: { text: 'BugSense' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
};

export const buildSlackPayload = (bug, eventType, bugUrl) => {
  const titlePrefix = TITLE_PREFIXES[eventType] || TITLE_PREFIXES.created;
  const field = (value) => `\`${escapeSlack(value)}\``;
  return {
    text: `${titlePrefix} *${escapeSlack(bug.title)}*\nPriority: ${field(bug.priority)} | Severity: ${field(bug.severity)} | Occurrences: ${field(bug.occurrences || 1)}\n<${bugUrl}|View Bug in BugSense>`,
  };
};

const post = async (type, url, payload) => {
  if (!isAllowedWebhookUrl(type, url)) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // The URL was allowlisted, the redirect target would not be.
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn(`${type} webhook dispatch error (non-fatal):`, err.message);
  }
};

// What pages anyone at all: a new incident with critical priority or blocker
// severity, one staff escalate to either level, or a resolved incident that
// re-occurs. Everything else is left to the dashboard, or a busy project would
// flood every channel.
export const isAlertWorthy = (bug, eventType) => {
  if (eventType === 'regression') return true;
  if (eventType === 'created' || eventType === 'escalated') {
    return bug.priority === 'critical' || bug.severity === 'blocker';
  }
  return false;
};

// Per-user preferences from the Profile page, applied on top of isAlertWorthy.
// An escalation is a critical alert, so it follows alertOnCritical.
const userWantsAlert = (webhooks, eventType) =>
  eventType === 'regression' ? webhooks.alertOnRegression !== false : webhooks.alertOnCritical !== false;

/**
 * Sends incident alerts for new, escalated and regressed bugs. Plain repeat occurrences do
 * not alert — a crash loop would otherwise flood every channel.
 */
export const dispatchWebhookAlert = async (bug, eventType = 'created') => {
  if (!isAlertWorthy(bug, eventType)) return;

  const clientUrl = getPrimaryClientUrl();
  const bugUrl = `${clientUrl}/bugs/${bug._id}`;
  const discordPayload = buildDiscordPayload(bug, eventType, bugUrl);
  const slackPayload = buildSlackPayload(bug, eventType, bugUrl);

  const targets = [];

  // Workspace-wide channels configured by the operator.
  if (process.env.DISCORD_WEBHOOK_URL) targets.push(['discord', process.env.DISCORD_WEBHOOK_URL]);
  if (process.env.SLACK_WEBHOOK_URL) targets.push(['slack', process.env.SLACK_WEBHOOK_URL]);

  try {
    const users = await User.find({
      $or: [{ 'webhooks.discordUrl': { $nin: ['', null] } }, { 'webhooks.slackUrl': { $nin: ['', null] } }],
    }).select('webhooks');

    for (const { webhooks } of users) {
      if (!webhooks || !userWantsAlert(webhooks, eventType)) continue;
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
