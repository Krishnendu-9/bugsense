import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { setupUser } from '../../test/user.js';
import { Route, Routes } from 'react-router-dom';
import AccountBlock from './AccountBlock.jsx';
import { renderWithProviders, USERS } from '../../test/renderWithProviders.jsx';

// The block plus the two places it can send you, so a test can tell them apart.
const renderBlock = ({ iconOnly = false, logout = vi.fn() } = {}) => {
  renderWithProviders(
    <Routes>
      <Route path="/" element={<AccountBlock iconOnly={iconOnly} />} />
      <Route path="/profile" element={<p>Profile page</p>} />
      <Route path="/login" element={<p>Login page</p>} />
    </Routes>,
    { user: USERS.admin, auth: { logout } }
  );
  return {
    logout,
    profile: screen.getByRole('link', { name: /Profile, signed in as admin@bugsense.dev/ }),
    signOut: screen.getByRole('button', { name: 'Sign out' }),
  };
};

describe('AccountBlock', () => {
  it('links the avatar, email and role to the Profile page', async () => {
    const user = setupUser();
    const { profile, logout } = renderBlock();

    expect(profile).toHaveAttribute('href', '/profile');
    // The visible email truncates in a narrow sidebar; hover shows all of it.
    expect(profile).toHaveAttribute('title', 'admin@bugsense.dev');
    expect(within(profile).getByText('AU')).toBeInTheDocument();
    expect(within(profile).getByText('admin@bugsense.dev')).toBeInTheDocument();
    expect(within(profile).getByText('admin')).toBeInTheDocument();

    await user.click(within(profile).getByText('admin@bugsense.dev'));
    expect(await screen.findByText('Profile page')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('signs out from its own button without opening Profile', async () => {
    const user = setupUser();
    const { profile, signOut, logout } = renderBlock();

    // A sibling of the link, not inside it.
    expect(profile.contains(signOut)).toBe(false);
    await user.click(signOut);

    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Profile page')).not.toBeInTheDocument();
  });

  it('gives the keyboard two separate stops: Profile, then Sign out', async () => {
    const user = setupUser();
    const { profile, signOut, logout } = renderBlock();

    await user.tab();
    expect(profile).toHaveFocus();
    await user.tab();
    expect(signOut).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('collapsed, links the avatar to Profile with Sign out below it', () => {
    const { profile, signOut } = renderBlock({ iconOnly: true });

    expect(profile).toHaveAttribute('href', '/profile');
    expect(within(profile).queryByText('admin@bugsense.dev')).not.toBeInTheDocument();
    expect(within(profile).getByText('AU')).toBeInTheDocument();
    // Below it: the next element in a vertical stack.
    expect(profile.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(profile.parentElement).toHaveClass('flex-col');
  });
});
