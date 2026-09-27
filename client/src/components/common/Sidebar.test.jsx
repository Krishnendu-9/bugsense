import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    expect(within(nav).getByRole('link', { name: /All Incidents/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Audit Trail/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /System Vitals/ })).not.toBeInTheDocument();
  });

  it('shows staff-only pages to developers', () => {
    renderSidebar(USERS.developer);
    const nav = screen.getByRole('complementary', { name: 'Main navigation' });

    expect(within(nav).getByRole('link', { name: /Audit Trail/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /System Vitals/ })).toBeInTheDocument();
  });

  it('shows the signed-in user', () => {
    renderSidebar(USERS.admin);
    expect(screen.getByText('admin@bugsense.dev')).toBeInTheDocument();
  });

  it('calls onToggle from the collapse button', async () => {
    const onToggle = vi.fn();
    renderSidebar(USERS.developer, { onToggle });

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
