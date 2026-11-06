import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setupUser } from '../test/user.js';
import { AuthProvider } from './AuthContext.jsx';
import useAuth from '../hooks/useAuth.js';
import api from '../api/axios.js';

// The axios instance has its own tests; here it stands in for the server.
vi.mock('../api/axios.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const TOKEN_KEY = 'bugsense_token';
const USER_KEY = 'bugsense_user';

// Shows what the provider exposes, the way ProtectedRoute and the pages read it.
function Probe() {
  const { user, token, loading, login, logout } = useAuth();
  return (
    <div>
      <p role="status">{loading ? 'Checking session' : user ? `Signed in as ${user.name}` : 'Signed out'}</p>
      <p>Token: {token ?? 'none'}</p>
      <button type="button" onClick={() => login('grace@bugsense.dev', 'correct-horse')}>Sign in</button>
      <button type="button" onClick={logout}>Sign out</button>
    </div>
  );
}

const renderProvider = () => render(<AuthProvider><Probe /></AuthProvider>);

const storeSession = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

const storedUser = () => JSON.parse(localStorage.getItem(USER_KEY));

beforeEach(() => {
  localStorage.clear();
  api.get.mockReset();
  api.post.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe('AuthProvider', () => {
  it('restores the stored session on mount and refreshes it from the server', async () => {
    storeSession('stored-token', { _id: 'u1', name: 'Ada', role: 'reporter' });
    let answer;
    api.get.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    renderProvider();

    // Until the server has answered, the session is reported as being checked,
    // which is what keeps ProtectedRoute from rendering or redirecting early.
    expect(screen.getByRole('status')).toHaveTextContent('Checking session');
    expect(api.get).toHaveBeenCalledWith('/auth/me');

    await act(async () => answer({ data: { _id: 'u1', name: 'Ada Lovelace', role: 'developer' } }));

    expect(screen.getByRole('status')).toHaveTextContent('Signed in as Ada Lovelace');
    expect(screen.getByText('Token: stored-token')).toBeInTheDocument();
    expect(storedUser()).toEqual({ _id: 'u1', name: 'Ada Lovelace', role: 'developer' });
  });

  it('drops a stored session the server no longer accepts', async () => {
    storeSession('revoked-token', { _id: 'u1', name: 'Ada', role: 'reporter' });
    api.get.mockRejectedValue(new Error('Request failed with status code 401'));
    renderProvider();

    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    expect(screen.getByText('Token: none')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  it('starts signed out, without asking the server, when nothing is stored', () => {
    renderProvider();

    expect(screen.getByRole('status')).toHaveTextContent('Signed out');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('signs in: stores the token and user in localStorage and exposes them', async () => {
    const user = setupUser();
    api.post.mockResolvedValue({ data: { token: 'issued-token', user: { _id: 'u2', name: 'Grace', role: 'reporter' } } });
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Signed in as Grace')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'grace@bugsense.dev', password: 'correct-horse' });
    expect(screen.getByText('Token: issued-token')).toBeInTheDocument();
    // The axios interceptor reads the token from here on every request.
    expect(localStorage.getItem(TOKEN_KEY)).toBe('issued-token');
    expect(storedUser()).toEqual({ _id: 'u2', name: 'Grace', role: 'reporter' });
  });

  it('signs out: forgets the user and removes the stored session', async () => {
    const user = setupUser();
    storeSession('stored-token', { _id: 'u1', name: 'Ada', role: 'reporter' });
    api.get.mockResolvedValue({ data: { _id: 'u1', name: 'Ada', role: 'reporter' } });
    renderProvider();
    expect(await screen.findByText('Signed in as Ada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(screen.getByRole('status')).toHaveTextContent('Signed out');
    expect(screen.getByText('Token: none')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });
});
