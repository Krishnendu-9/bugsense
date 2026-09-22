import User from '../models/User.model.js';
import { verifyToken } from '../services/token.service.js';

// Resolves a JWT to its user, rejecting tokens minted before the user's last
// password change so that changing a password signs out every other session.
export const resolveUserFromToken = async (token) => {
  const decoded = verifyToken(token);
  const user = await User.findById(decoded.id).select('-password');
  if (!user) return null;

  if ((decoded.v || 0) !== (user.tokenVersion || 0)) return null;
  return user;
};

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized — no token' });
  }

  try {
    req.user = await resolveUserFromToken(authHeader.split(' ')[1]);
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized — session is no longer valid' });
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Not authorized — invalid token' });
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) return next();
  return res.status(403).json({ message: 'You do not have permission to perform this action' });
};

export const adminOnly = authorize('admin');
