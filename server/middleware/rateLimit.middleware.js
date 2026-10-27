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

// Every AI route runs after protect(), so the limit is per account: each call
// is a paid model request, and a per-IP key would let one person with several
// addresses spend more while a whole office behind one NAT shared one budget.
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // max 50 requests per windowMs, per user
  keyGenerator: (req) => `user:${req.user._id}`,
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
