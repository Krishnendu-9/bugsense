import rateLimit from 'express-rate-limit';

const isLocalhost = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip.includes('localhost') || ip === '::ffff:127.0.0.1';
};

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: process.env.NODE_ENV === 'production' ? 2000 : 50000,
  skip: (req) => process.env.NODE_ENV !== 'production' && isLocalhost(req),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: process.env.NODE_ENV === 'production' ? 50 : 1000,
  skip: (req) => process.env.NODE_ENV !== 'production' && isLocalhost(req),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // max 50 requests per windowMs
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'AI analysis rate limit reached. Please wait a moment before submitting another log.',
  },
});

// Public SDK ingestion endpoint: unauthenticated by design, so it needs its own
// ceiling. A crash loop in an embedding app must not be able to write unbounded
// rows. Generous enough for real bursts, tight enough to bound the damage.
export const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: process.env.NODE_ENV === 'production' ? 60 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Telemetry ingestion rate limit reached for this client.',
  },
});
