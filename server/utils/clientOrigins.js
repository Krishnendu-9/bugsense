const DEFAULT_CLIENT_URL = 'http://localhost:5173';

// CLIENT_URL may list several dashboard origins, comma-separated (for example
// the production domain plus a Vercel preview URL). All of them pass CORS and
// the socket handshake; the first one is used to build links in alerts and
// GitHub issues.
export const getClientOrigins = () => {
  const origins = (process.env.CLIENT_URL || DEFAULT_CLIENT_URL)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length ? origins : [DEFAULT_CLIENT_URL];
};

export const getPrimaryClientUrl = () => getClientOrigins()[0];
