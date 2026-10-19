import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, Mail, Lock, User, UserCog } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuth from '../../hooks/useAuth.js';
import api from '../../api/axios.js';
import { SIGNUP_ROLE_OPTIONS } from '../../utils/constants.js';

export default function Register() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Whether this deployment lets visitors sign up as developers. Until the
  // server answers, only the always-allowed Reporter option is offered.
  const [developerSignup, setDeveloperSignup] = useState(false);

  const { register, handleSubmit, control, formState: { errors } } = useForm({
    defaultValues: { role: 'reporter' },
  });
  const role = useWatch({ control, name: 'role' });

  useEffect(() => {
    let cancelled = false;
    api.get('/auth/config')
      .then((res) => { if (!cancelled) setDeveloperSignup(Boolean(res.data.developerSignup)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const roleOptions = developerSignup
    ? SIGNUP_ROLE_OPTIONS
    : SIGNUP_ROLE_OPTIONS.filter((opt) => opt.value === 'reporter');

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await registerUser(data.name, data.email, data.password, data.role);
      toast.success('Account created! Welcome to BugSense.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent mb-4">
            <ShieldCheck size={28} className="text-on-accent" />
          </div>
          <h1 className="text-2xl font-bold text-fg">
            Join <span className="text-accent">BugSense</span>
          </h1>
          <p className="text-muted text-sm mt-1">Create your account to get started</p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label" htmlFor="register-name">Full Name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  id="register-name"
                  {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name is too short' } })}
                  type="text"
                  className="input-field pl-9"
                  placeholder="Jane Smith"
                  autoComplete="name"
                />
              </div>
              {errors.name && <p className="text-priority-high text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="register-email">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  id="register-email"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email address' },
                  })}
                  type="email"
                  className="input-field pl-9"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              {errors.email && <p className="text-priority-high text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="register-password">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  id="register-password"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Password must be at least 6 characters' },
                  })}
                  type={showPassword ? 'text' : 'password'}
                  className="input-field pl-9 pr-10"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-priority-high text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="label flex items-center gap-1" htmlFor="register-role">
                <UserCog size={13} /> Role
              </label>
              <select id="register-role" {...register('role')} className="input-field">
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1">
                {role === 'developer'
                  ? 'Developers can update bug status and assign tickets.'
                  : developerSignup
                    ? 'Reporters can submit and track their own bugs.'
                    : 'Reporters can submit and track their own bugs. Developer access is granted by an admin.'}
              </p>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 mt-2">
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-fg animate-pulse" aria-hidden="true" />
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:text-accent/80 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
