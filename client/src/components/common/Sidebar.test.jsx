import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { setupUser } from '../../test/user.js';
import Sidebar from './Sidebar.jsx';
import { renderWithProviders, USERS } from '../../test/renderWithProviders.jsx';

const renderSidebar = (user, props = {}) =>
  renderWithProviders(
    <Sidebar collapsed={false} onToggle={() => {}} mobileOpen={false} onCloseMobile={() => {}} {...props} />,
    { user }
  );

describe('Sidebar', () => {
  it('hides staff-only pages from reporters', () => {
    renderSidebar(USERS.reporter);
    const nav = screen.getByRole('complementary', { name: 'Main navigation' });

    expect(within(nav).getByRole('link', { name: 'Bugs' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Metrics' })).not.toBeInTheDocument();
    // Its buttons file real SDK bugs.
    expect(within(nav).queryByRole('link', { name: 'SDK sandbox' })).not.toBeInTheDocument();
  });

  it('shows staff-only pages to developers', () => {
    renderSidebar(USERS.developer);
    const nav = screen.getByRole('complementary', { name: 'Main navigation' });

    expect(within(nav).getByRole('link', { name: 'Audit log' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Metrics' })).toBeInTheDocument();
  });

  it('uses one noun and offers no report entry of its own', () => {
    renderSidebar(USERS.admin);
    const nav = screen.getByRole('complementary', { name: 'Main navigation' });
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent.trim());

    expect(labels).toEqual(expect.arrayContaining(['Overview', 'Bugs', 'Board', 'Metrics', 'Audit log', 'AI analyzer', 'SDK sandbox', 'Profile', 'Team']));
    expect(nav.textContent).not.toMatch(/incident/i);
    // The top bar's New bug is the shell's only way to report a bug.
    expect(nav.querySelector('a[href="/report"]')).toBeNull();
  });

  it('hides the Team page from developers', () => {
    renderSidebar(USERS.developer);
    expect(screen.queryByRole('link', { name: /Team/ })).not.toBeInTheDocument();
  });

  it('shows the Team page to admins', () => {
    renderSidebar(USERS.admin);
    expect(screen.getByRole('link', { name: /Team/ })).toBeInTheDocument();
  });

  it('shows the signed-in user', () => {
    renderSidebar(USERS.admin);
    expect(screen.getByText('admin@bugsense.dev')).toBeInTheDocument();
  });

  it('calls onToggle from the collapse button', async () => {
    const onToggle = vi.fn();
    renderSidebar(USERS.developer, { onToggle });

    await setupUser().click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
