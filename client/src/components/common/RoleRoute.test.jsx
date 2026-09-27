import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import RoleRoute from './RoleRoute.jsx';
import { renderWithProviders, USERS } from '../../test/renderWithProviders.jsx';

const STAFF = ['developer', 'admin'];
const page = <RoleRoute roles={STAFF}><h1>Audit Trail</h1></RoleRoute>;

describe('RoleRoute', () => {
  it('shows a Staff only page to reporters instead of the content', () => {
    renderWithProviders(page, { user: USERS.reporter });

    expect(screen.getByRole('heading', { name: 'Staff only' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Audit Trail' })).not.toBeInTheDocument();
  });

  it.each([['developer'], ['admin']])('renders the content for a %s', (role) => {
    renderWithProviders(page, { user: USERS[role] });

    expect(screen.getByRole('heading', { name: 'Audit Trail' })).toBeInTheDocument();
    expect(screen.queryByText('Staff only')).not.toBeInTheDocument();
  });
});
