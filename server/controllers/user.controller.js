import { validationResult } from 'express-validator';
import User from '../models/User.model.js';

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      webhooks: user.webhooks || {},
      createdAt: user.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateUserProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { name, currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) {
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

      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters' });
      }

      user.password = newPassword;
    }

    const updatedUser = await user.save();

    return res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      avatar: updatedUser.avatar,
      createdAt: updatedUser.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarUrl },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({
      message: 'Avatar uploaded successfully',
      avatar: user.avatar,
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
    return res.status(500).json({ message: err.message });
  }
};

export const updateWebhooks = async (req, res) => {
  const { discordUrl, slackUrl, alertOnCritical, alertOnRegression } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.webhooks = {
      discordUrl: discordUrl || '',
      slackUrl: slackUrl || '',
      alertOnCritical: alertOnCritical !== undefined ? alertOnCritical : true,
      alertOnRegression: alertOnRegression !== undefined ? alertOnRegression : true,
    };

    await user.save();
    return res.json({ message: 'Webhooks updated successfully', webhooks: user.webhooks });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const testWebhook = async (req, res) => {
  const { type, url } = req.body;
  if (!url) {
    return res.status(400).json({ message: 'Webhook URL is required' });
  }

  try {
    if (type === 'discord') {
      const payload = {
        username: 'BugSense Observability',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png',
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
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return res.status(400).json({ message: `Discord rejected webhook: HTTP ${response.status}` });
      }
    } else if (type === 'slack') {
      const payload = {
        text: '🔔 *BugSense Webhook Test Alert*: Your Slack webhook integration is configured and verified successfully!',
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return res.status(400).json({ message: `Slack rejected webhook: HTTP ${response.status}` });
      }
    }

    return res.json({ success: true, message: `Test alert sent successfully to ${type}!` });
  } catch (err) {
    return res.status(500).json({ message: `Failed to dispatch test alert: ${err.message}` });
  }
};
