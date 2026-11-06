import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import { renderWithProviders, USERS } from '../../test/renderWithProviders.jsx';

// Stands in for the Login page and shows the path ProtectedRoute handed it,
// which Login uses to send the user back after signing in.
function SignInPage() {
  const { state } = useLocation();
  return <h1>{state?.from ? `Sign in (from ${state.from})` : 'Sign in'}</h1>;
}

const app = (
  <Routes>
    <Route path="/login" element={<SignInPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/bugs" element={<h1>Bug list</h1>} />
    </Route>
  </Routes>
);

describe('ProtectedRoute', () => {
  it('sends a signed-out visitor to the sign-in page, remembering where they were going', () => {
    renderWithProviders(app, { user: null, route: '/bugs' });

    expect(screen.getByRole('heading', { name: 'Sign in (from /bugs)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bug list' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  // A stored session is shown as loading until the server confirms it. With a
  // stored user that keeps a revoked session's pages hidden; without one it
  // keeps a returning user from being bounced to sign-in on every reload.
  it.each([
    ['a stored user', USERS.developer],
    ['no stored user', null],
  ])('shows a skeleton, neither the page nor sign-in, while the session is checked (%s)', (_, user) => {
    renderWithProviders(app, { user, route: '/bugs', auth: { loading: true } });

    expect(screen.getByLabelText('Loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('heading', { name: 'Bug list' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Sign in/ })).not.toBeInTheDocument();
  });

  it('renders the page inside the app shell for a signed-in user', () => {
    renderWithProviders(app, { user: USERS.reporter, route: '/bugs' });

    expect(screen.getByRole('heading', { name: 'Bug list' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Sign in/ })).not.toBeInTheDocument();
  });
});
