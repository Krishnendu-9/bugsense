import jwt from 'jsonwebtoken';

/**
 * Service: Generate a signed JWT token with 7-day expiration
 */
export const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'bugsense_jwt_secret_dev_key_2026', { expiresIn: '7d' });

export default generateToken;
