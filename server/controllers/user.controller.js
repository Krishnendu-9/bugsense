import { validationResult } from 'express-validator';
import User from '../models/User.model.js';
import generateToken from '../services/token.service.js';
import { removeUpload } from '../utils/uploads.js';
import { isAllowedWebhookUrl, WEBHOOK_URL_HINT } from '../utils/webhookUrl.js';

const toPublicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  webhooks: user.webhooks || {},
  createdAt: user.createdAt,
});

export const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json(toPublicUser(user));
  } catch (err) {
    return next(err);
  }
};

// People a bug can be assigned to.
export const listAssignableUsers = async (_req, res, next) => {
  try {
    const users = await User.find({ role: { $in: ['developer', 'admin'] } })
      .select('name email avatar role')
      .sort({ name: 1 });
    return res.json(users);
  } catch (err) {
    return next(err);
  }
};

export const updateUserProfile = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { name, currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (typeof name === 'string' && name.trim()) {
      user.name = name.trim();
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to set a new password' });
      }

      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: 'Incorrect current password' });
      }

      user.password = newPassword;
    }

    const updatedUser = await user.save();

    const body = toPublicUser(updatedUser);
    // A password change invalidates every existing token, including the one
    // that made this request, so the caller receives a fresh one.
    if (newPassword) body.token = generateToken(updatedUser);

    return res.json(body);
  } catch (err) {
    return next(err);
  }
};

export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const previous = user.avatar;
    user.avatar = `/uploads/${req.file.filename}`;
    await user.save();
    await removeUpload(previous);

    return res.json({
      message: 'Avatar uploaded successfully',
      avatar: user.avatar,
      user: toPublicUser(user),
    });
  } catch (err) {
    return next(err);
  }
};

const validateWebhookInput = (type, url) => {
  if (url === undefined || url === null || url === '') return null;
  if (typeof url !== 'string' || !isAllowedWebhookUrl(type, url.trim())) return WEBHOOK_URL_HINT[type];
  return null;
};

export const updateWebhooks = async (req, res, next) => {
  const { discordUrl, slackUrl, alertOnCritical, alertOnRegression } = req.body;

  const invalid = validateWebhookInput('discord', discordUrl) || validateWebhookInput('slack', slackUrl);
  if (invalid) return res.status(400).json({ message: invalid });

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.webhooks = {
      discordUrl: discordUrl ? discordUrl.trim() : '',
      slackUrl: slackUrl ? slackUrl.trim() : '',
      alertOnCritical: alertOnCritical !== false,
      alertOnRegression: alertOnRegression !== false,
    };

    await user.save();
    return res.json({ message: 'Webhooks updated successfully', webhooks: user.webhooks });
  } catch (err) {
    return next(err);
  }
};

export const testWebhook = async (req, res, next) => {
  const { type, url } = req.body;
  if (type !== 'discord' && type !== 'slack') {
    return res.status(400).json({ message: 'Webhook type must be "discord" or "slack"' });
  }
  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ message: 'Webhook URL is required' });
  }
  if (!isAllowedWebhookUrl(type, url.trim())) {
    return res.status(400).json({ message: WEBHOOK_URL_HINT[type] });
  }

  const payload =
    type === 'discord'
      ? {
          username: 'BugSense Observability',
          embeds: [
            {
              title: '🔔 BugSense Webhook Test Alert',
              description: 'Your Discord webhook integration is configured and verified successfully!',
              color: 0x22c55e,
              fields: [
                { name: 'Status', value: 'Connected & Operational', inline: true },
                { name: 'Timestamp', value: new Date().toLocaleTimeString(), inline: true },
              ],
              footer: { text: 'BugSense Incident Hub' },
            },
          ],
        }
      : {
          text: '🔔 *BugSense Webhook Test Alert*: Your Slack webhook integration is configured and verified successfully!',
        };

  try {
    const response = await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.status(400).json({ message: `${type === 'discord' ? 'Discord' : 'Slack'} rejected webhook: HTTP ${response.status}` });
    }

    return res.json({ success: true, message: `Test alert sent successfully to ${type}!` });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'TypeError') {
      return res.status(502).json({ message: `Could not reach ${type}: ${err.message}` });
    }
    return next(err);
  }
};
