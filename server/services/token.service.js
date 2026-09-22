import jwt from 'jsonwebtoken';

const DEV_FALLBACK_SECRET = 'bugsense_jwt_secret_dev_key_2026';

// server.js refuses to start in production without JWT_SECRET, so the fallback
// only ever applies to local development.
export const getJwtSecret = () => process.env.JWT_SECRET || DEV_FALLBACK_SECRET;

/**
 * Service: Generate a signed JWT token with 7-day expiration
 */
export const generateToken = (user) =>
  jwt.sign({ id: user._id.toString(), v: user.tokenVersion || 0 }, getJwtSecret(), { expiresIn: '7d' });

export const verifyToken = (token) => jwt.verify(token, getJwtSecret());

export default generateToken;
