import { validationResult } from 'express-validator';
import User from '../models/User.model.js';
import generateToken from '../services/token.service.js';
import { logActivity } from '../services/audit.service.js';

// Developers are staff: they can edit any bug and see the audit trail. Whether
// visitors may sign up as one is a deployment decision. ALLOW_DEVELOPER_SIGNUP
// decides explicitly; unset, it is allowed in development and refused in
// production, where an admin promotes people from the Team page instead.
export const isDeveloperSignupAllowed = () => {
  const flag = process.env.ALLOW_DEVELOPER_SIGNUP;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

// Public settings the sign-up page needs before anyone is logged in.
export const getAuthConfig = (_req, res) => {
  res.json({ developerSignup: isDeveloperSignupAllowed() });
};

export const register = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { name, email, password, role } = req.body;

  if (role === 'developer' && !isDeveloperSignupAllowed()) {
    return res.status(403).json({ message: 'Developer sign-up is disabled here. Register as a reporter and ask an admin to promote you.' });
  }

  try {
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    // Self-service registration must never grant admin. Admin accounts are
    // provisioned out of band (see scripts/seed.js) — otherwise anyone can
    // POST role: 'admin' and gain delete rights over every bug.
    const safeRole = role === 'developer' ? 'developer' : 'reporter';

    const user = await User.create({ name, email, password, role: safeRole });
    const token = generateToken(user);

    logActivity({
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: user._id,
      performedBy: user._id,
      performedByName: user.name,
      details: `${user.name} signed up as a ${user.role}`,
    });

    return res.status(201).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      // Repeated failures against one account are the signal worth seeing in
      // the audit trail. The attempted password is never recorded.
      logActivity({
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user?._id || null,
        performedByName: 'Anonymous',
        details: `Failed sign-in for ${email}${user ? '' : ' (no such account)'}`,
        metadata: { ip: req.ip },
      });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user);

    return res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-tokenVersion');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) {
    return next(err);
  }
};
