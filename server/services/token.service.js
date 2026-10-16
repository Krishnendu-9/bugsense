import jwt from 'jsonwebtoken';

const DEV_FALLBACK_SECRET = 'bugsense_jwt_secret_dev_key_2026';

// Values that ship in this repository or its docs. Anyone can read them, so a
// token signed with one of them can be forged by anyone.
const PUBLIC_SECRETS = new Set([
  DEV_FALLBACK_SECRET,
  'bugsense_local_demo_secret_change_me',
  'your_jwt_secret_key',
  'test-secret',
]);

const MIN_SECRET_LENGTH = 32;

// server.js refuses to start in production without a safe JWT_SECRET, so the
// fallback only ever applies to local development.
export const getJwtSecret = () => process.env.JWT_SECRET || DEV_FALLBACK_SECRET;

/**
 * Checks JWT_SECRET before the server starts. Returns a list of problems;
 * empty means safe. In production a missing secret is always fatal, and a
 * public or short one is fatal unless ALLOW_INSECURE_JWT_SECRET=true (the
 * docker-compose local demo sets this so it runs with zero configuration).
 */
export const checkJwtSecret = (env = process.env) => {
  const secret = env.JWT_SECRET;
  if (env.NODE_ENV !== 'production') return { fatal: false, warnings: [] };
  if (!secret) return { fatal: true, warnings: ['JWT_SECRET must be set in production.'] };

  const warnings = [];
  if (PUBLIC_SECRETS.has(secret)) warnings.push('JWT_SECRET is a published example value; anyone can forge sessions.');
  if (secret.length < MIN_SECRET_LENGTH) warnings.push(`JWT_SECRET is shorter than ${MIN_SECRET_LENGTH} characters.`);

  return { fatal: warnings.length > 0 && env.ALLOW_INSECURE_JWT_SECRET !== 'true', warnings };
};

/**
 * Service: Generate a signed JWT token with 7-day expiration
 */
export const generateToken = (user) =>
  jwt.sign({ id: user._id.toString(), v: user.tokenVersion || 0 }, getJwtSecret(), { expiresIn: '7d' });

export const verifyToken = (token) => jwt.verify(token, getJwtSecret());

export default generateToken;
