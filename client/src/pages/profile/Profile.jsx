import { useState, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  User as UserIcon,
  Mail,
  Shield,
  Calendar,
  Camera,
  Lock,
  Eye,
  EyeOff,
  Save,
  KeyRound,
  Bell,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuth from '../../hooks/useAuth.js';
import api from '../../api/axios.js';
import { RoleBadge } from '../../components/common/Badge.jsx';
import { getInitials, formatDate, getImageUrl } from '../../utils/helpers.js';

export default function Profile() {
  const { user, updateUser, replaceToken } = useAuth();
  const fileInputRef = useRef(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [webhookSaving, setWebhookSaving] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  // Form for general info
  const {
    register: regProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors, isDirty: isProfileDirty },
  } = useForm({
    defaultValues: {
      name: user?.name || '',
    },
  });

  // Form for password change
  const {
    register: regPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPasswordForm,
    control: passwordControl,
    formState: { errors: passwordErrors },
  } = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const newPasswordValue = useWatch({ control: passwordControl, name: 'newPassword' });

  // Form for alert webhooks
  const {
    register: regWebhook,
    handleSubmit: handleWebhookSubmit,
    control: webhookControl,
    getValues: getWebhookValues,
  } = useForm({
    defaultValues: {
      discordUrl: user?.webhooks?.discordUrl || '',
      slackUrl: user?.webhooks?.slackUrl || '',
      alertOnCritical: user?.webhooks?.alertOnCritical !== false,
      alertOnRegression: user?.webhooks?.alertOnRegression !== false,
    },
  });
  const [discordUrl, slackUrl] = useWatch({ control: webhookControl, name: ['discordUrl', 'slackUrl'] });

  // Handle Avatar Upload
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WebP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    setAvatarUploading(true);
    try {
      const { data } = await api.post('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser({ avatar: data.avatar });
      toast.success('Avatar updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Profile (Name) Update
  const onProfileSubmit = async (data) => {
    setProfileSaving(true);
    try {
      const res = await api.put('/users/profile', { name: data.name });
      updateUser(res.data);
      toast.success('Profile information updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Password Update
  const onPasswordSubmit = async (data) => {
    setPasswordSaving(true);
    try {
      const res = await api.put('/users/profile', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      // Changing the password revokes every existing session token, this one
      // included; the response carries its replacement.
      if (res.data.token) replaceToken(res.data.token);
      toast.success('Password changed. Other sessions have been signed out.');
      resetPasswordForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const onWebhookSubmit = async (values) => {
    setWebhookSaving(true);
    try {
      const res = await api.put('/users/webhooks', {
        discordUrl: values.discordUrl.trim(),
        slackUrl: values.slackUrl.trim(),
        alertOnCritical: values.alertOnCritical,
        alertOnRegression: values.alertOnRegression,
      });
      updateUser({ webhooks: res.data.webhooks });
      toast.success('Webhook configurations saved successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save webhooks');
    } finally {
      setWebhookSaving(false);
    }
  };

  const handleTestWebhook = async (type) => {
    const url = getWebhookValues(type === 'discord' ? 'discordUrl' : 'slackUrl').trim();
    if (!url) {
      toast.error(`Please enter a valid ${type} webhook URL first`);
      return;
    }
    if (type === 'discord') setTestingDiscord(true);
    if (type === 'slack') setTestingSlack(true);

    try {
      const res = await api.post('/users/webhooks/test', { type, url });
      toast.success(res.data.message || `Test alert sent to ${type}!`);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to test ${type} webhook`);
    } finally {
      if (type === 'discord') setTestingDiscord(false);
      if (type === 'slack') setTestingSlack(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-base">Profile</h1>
        <p className="text-muted text-sm mt-0.5">
          Manage your account credentials, avatar, and workspace preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column — User Identity Card */}
        <div className="space-y-6">
          <div className="glass-card p-6 flex flex-col items-center text-center relative overflow-hidden">
            {/* Background ambient gradient glow */}
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-secondary/20 rounded-full blur-2xl pointer-events-none" />

            {/* Avatar with upload trigger */}
            <div className="relative group mb-4">
              <div className="w-24 h-24 rounded-full p-1 bg-accent">
                <div className="w-full h-full rounded-full bg-surface overflow-hidden flex items-center justify-center text-fg text-2xl font-bold">
                  {user?.avatar ? (
                    <img
                      src={getImageUrl(user.avatar)}
                      alt={user.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getInitials(user?.name)
                  )}
                </div>
              </div>

              {/* Upload overlay */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                aria-label="Upload avatar"
                className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200 cursor-pointer disabled:opacity-100"
              >
                {avatarUploading ? (
                  <Camera size={20} className="animate-pulse" aria-label="Uploading" />
                ) : (
                  <>
                    <Camera size={20} className="mb-0.5" />
                    <span className="text-[10px] font-medium">Change</span>
                  </>
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            <h2 className="text-lg font-bold text-text-base">{user?.name}</h2>
            <p className="text-xs text-muted mb-3">{user?.email}</p>

            <div className="mb-5">
              <RoleBadge role={user?.role} />
            </div>

            <div className="w-full pt-4 border-t border-hairline space-y-2.5 text-left text-xs text-muted">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail size={13} className="text-muted" /> Email
                </span>
                <span className="text-text-base truncate max-w-[150px]">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Shield size={13} className="text-muted" /> Role
                </span>
                <span className="text-text-base capitalize">{user?.role}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-muted" /> Member since
                </span>
                <span className="text-text-base">{formatDate(user?.createdAt, 'MMM yyyy')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — General Information & Security */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Account Details */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-hairline">
              <UserIcon size={18} className="text-primary" />
              <h3 className="text-base font-semibold text-text-base">Account Details</h3>
            </div>

            <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  {...regProfile('name', { required: 'Name is required' })}
                  className="input-field text-sm"
                  placeholder="Your full name"
                />
                {profileErrors.name && (
                  <p className="text-xs text-priority-high mt-1">{profileErrors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="input-field text-sm opacity-60 cursor-not-allowed bg-track"
                  />
                  <p className="text-[11px] text-muted/80 mt-1">Email cannot be modified.</p>
                </div>

                <div>
                  <label className="label">Assigned Role</label>
                  <input
                    type="text"
                    disabled
                    value={user?.role ? user.role.toUpperCase() : ''}
                    className="input-field text-sm opacity-60 cursor-not-allowed bg-track"
                  />
                  <p className="text-[11px] text-muted/80 mt-1">Managed by organization admins.</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={profileSaving || !isProfileDirty}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  {profileSaving ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-primary-fg animate-pulse" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={15} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Password & Security */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-hairline">
              <KeyRound size={18} className="text-secondary" />
              <h3 className="text-base font-semibold text-text-base">Change Password</h3>
            </div>

            <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
              <div>
                <label className="label">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    {...regPassword('currentPassword', {
                      required: 'Current password is required',
                    })}
                    className="input-field text-sm pr-10"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text-base transition-colors"
                  >
                    {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordErrors.currentPassword && (
                  <p className="text-xs text-priority-high mt-1">
                    {passwordErrors.currentPassword.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      {...regPassword('newPassword', {
                        required: 'New password is required',
                        minLength: {
                          value: 6,
                          message: 'Must be at least 6 characters',
                        },
                      })}
                      className="input-field text-sm pr-10"
                      placeholder="Minimum 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text-base transition-colors"
                    >
                      {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {passwordErrors.newPassword && (
                    <p className="text-xs text-priority-high mt-1">
                      {passwordErrors.newPassword.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      {...regPassword('confirmPassword', {
                        required: 'Please confirm new password',
                        validate: (val) =>
                          val === newPasswordValue || 'Passwords do not match',
                      })}
                      className="input-field text-sm pr-10"
                      placeholder="Re-enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text-base transition-colors"
                    >
                      {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {passwordErrors.confirmPassword && (
                    <p className="text-xs text-priority-high mt-1">
                      {passwordErrors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  {passwordSaving ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-primary-fg animate-pulse" aria-hidden="true" />
                      Updating Password...
                    </>
                  ) : (
                    <>
                      <Lock size={15} /> Update Password
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Card 3: Real-Time Webhooks & Alert Integrations */}
          <div className="glass-card p-6 border border-border space-y-5">
            <div className="flex items-center gap-2 pb-4 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-track border border-border flex items-center justify-center text-muted">
                <Bell size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-base">Webhook alerts</h3>
                <p className="text-xs text-muted">Receive live notifications in Discord and Slack when bugs are created or regress</p>
              </div>
            </div>

            <form onSubmit={handleWebhookSubmit(onWebhookSubmit)} className="space-y-4">
              {[
                { type: 'discord', label: 'Discord Webhook URL', field: 'discordUrl', placeholder: 'https://discord.com/api/webhooks/...', value: discordUrl, testing: testingDiscord },
                { type: 'slack', label: 'Slack Webhook URL', field: 'slackUrl', placeholder: 'https://hooks.slack.com/services/...', value: slackUrl, testing: testingSlack },
              ].map(({ type, label, field, placeholder, value, testing }) => (
                <div key={type}>
                  <label className="label" htmlFor={`webhook-${type}`}>{label}</label>
                  <div className="flex gap-2">
                    <input
                      id={`webhook-${type}`}
                      type="url"
                      {...regWebhook(field)}
                      placeholder={placeholder}
                      className="input-field text-sm font-mono flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleTestWebhook(type)}
                      disabled={testing || !value}
                      className="btn-secondary text-xs px-3 disabled:opacity-40"
                    >
                      {testing ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-2 flex flex-wrap gap-4 text-xs text-muted">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...regWebhook('alertOnCritical')}
                    className="rounded border-border bg-track text-primary"
                  />
                  Alert on critical and blocker bugs
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...regWebhook('alertOnRegression')}
                    className="rounded border-border bg-track text-primary"
                  />
                  Alert on Telemetry Regressions
                </label>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={webhookSaving}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  {webhookSaving ? 'Saving...' : 'Save Webhook Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
