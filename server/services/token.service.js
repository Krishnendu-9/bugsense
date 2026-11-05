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

// The only environments that may run on the built-in secret, and only when
// NODE_ENV names them. Anything else, an unset NODE_ENV included, is treated
// as production: a host that forgets NODE_ENV must not sign sessions with a
// key published in this repository.
const DEV_ENVIRONMENTS = ['development', 'test'];
const allowsDevSecret = (env) => DEV_ENVIRONMENTS.includes(env.NODE_ENV);

// server.js refuses to start without a safe JWT_SECRET outside development and
// test. This refuses too, so no other entry point can fall back to the
// published secret either.
export const getJwtSecret = (env = process.env) => {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (allowsDevSecret(env)) return DEV_FALLBACK_SECRET;
  throw new Error('JWT_SECRET is not set, and NODE_ENV is not development or test.');
};

/**
 * Checks JWT_SECRET before the server starts. Returns a list of problems;
 * empty means safe. Unless NODE_ENV is explicitly development or test, a
 * missing secret is always fatal, and a public or short one is fatal unless
 * ALLOW_INSECURE_JWT_SECRET=true (the docker-compose local demo sets this, with
 * NODE_ENV=production, so it runs with zero configuration).
 */
export const checkJwtSecret = (env = process.env) => {
  const secret = env.JWT_SECRET;
  if (allowsDevSecret(env)) return { fatal: false, warnings: [] };
  if (!secret) {
    const where = env.NODE_ENV
      ? `NODE_ENV is "${env.NODE_ENV}"`
      : 'NODE_ENV is not set, so the server runs as in production';
    return { fatal: true, warnings: [`JWT_SECRET must be set: ${where}. Use NODE_ENV=development locally.`] };
  }

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
