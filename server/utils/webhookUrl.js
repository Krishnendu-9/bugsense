// Outbound webhooks are the only place the server fetches a user-supplied URL.
// Restricting them to the real Discord/Slack endpoints stops the feature being
// used to make the server call internal services or cloud metadata addresses.
const ALLOWED = {
  discord: {
    hosts: ['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'],
    pathPrefixes: ['/api/webhooks/'],
  },
  slack: {
    hosts: ['hooks.slack.com'],
    pathPrefixes: ['/services/', '/workflows/', '/triggers/'],
  },
};

export const isAllowedWebhookUrl = (type, url) => {
  const rule = ALLOWED[type];
  if (!rule || typeof url !== 'string' || !url) return false;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return (
    parsed.protocol === 'https:' &&
    !parsed.username &&
    !parsed.password &&
    (parsed.port === '' || parsed.port === '443') &&
    rule.hosts.includes(parsed.hostname.toLowerCase()) &&
    rule.pathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix))
  );
};

export const WEBHOOK_URL_HINT = {
  discord: 'Discord webhook URLs must look like https://discord.com/api/webhooks/…',
  slack: 'Slack webhook URLs must look like https://hooks.slack.com/services/…',
};
