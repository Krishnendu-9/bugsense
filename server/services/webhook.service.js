/**
 * Webhook Notification Service: Sends automated incident alerts to Discord and Slack
 */
export const dispatchWebhookAlert = async (bug, eventType = 'created') => {
  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const bugUrl = `${clientUrl}/bugs/${bug._id}`;

  const priorityColors = {
    critical: 0x7c3aed, // Purple
    high: 0xef4444, // Red
    medium: 0xf59e0b, // Amber
    low: 0x22c55e, // Green
  };

  const titlePrefix = eventType === 'regression' ? '🚨 [REGRESSION]' : eventType === 'created' ? '🐛 [NEW BUG]' : '🔄 [BUG UPDATED]';

  // Discord Embed
  if (discordUrl) {
    try {
      const payload = {
        username: 'BugSense Observability',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png',
        embeds: [
          {
            title: `${titlePrefix} ${bug.title}`,
            url: bugUrl,
            description: bug.description?.replace(/<[^>]*>?/gm, '').slice(0, 250) || 'No description provided.',
            color: priorityColors[bug.priority] || 0x6366f1,
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

      await fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('Discord webhook dispatch error (non-fatal):', err.message);
    }
  }

  // Slack Message
  if (slackUrl) {
    try {
      const payload = {
        text: `${titlePrefix} *${bug.title}*\nPriority: \`${bug.priority}\` | Severity: \`${bug.severity}\` | Occurrences: \`${bug.occurrences || 1}\`\n<${bugUrl}|View Bug in BugSense>`,
      };

      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('Slack webhook dispatch error (non-fatal):', err.message);
    }
  }
};
