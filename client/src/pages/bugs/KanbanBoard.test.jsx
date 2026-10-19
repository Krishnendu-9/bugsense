import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { setupUser } from '../../test/user.js';
import KanbanBoard from './KanbanBoard.jsx';
import api from '../../api/axios.js';
import { renderWithProviders, USERS } from '../../test/renderWithProviders.jsx';

vi.mock('../../api/axios.js', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

const NOW = new Date().toISOString();
const bug = (over) => ({
  priority: 'medium',
  severity: 'minor',
  source: 'manual',
  occurrences: 1,
  project: 'Web',
  comments: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const BUGS = [
  bug({ _id: 'b-open', title: 'Open bug', status: 'open', reporter: { _id: USERS.reporter._id } }),
  bug({ _id: 'b-resolved', title: 'Resolved bug', status: 'resolved', reporter: { _id: 'someone-else' } }),
];

const menuItems = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);

describe('Board Move menu', () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue({ data: { bugs: BUGS, total: BUGS.length, page: 1, pages: 1, limit: 100 } });
    api.put.mockReset().mockResolvedValue({ data: {} });
  });

  it('replaces the arrows with one Move menu listing the other three statuses', async () => {
    renderWithProviders(<KanbanBoard />, { user: USERS.developer, route: '/board' });
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: 'Move "Open bug"' }));
    expect(menuItems()).toEqual(['In Progress', 'Resolved', 'Closed']);
    expect(screen.queryByRole('button', { name: /Move .* to / })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Resolved' }));
    expect(api.put).toHaveBeenCalledWith('/bugs/b-open', { status: 'resolved' });
    // Optimistically in the Resolved column now.
    expect(within(screen.getByRole('region', { name: /^Resolved, 2 bugs/ })).getByText('Open bug')).toBeInTheDocument();
  });

  it('offers a reporter only what they may do, and nothing on someone else’s bug', async () => {
    renderWithProviders(<KanbanBoard />, { user: USERS.reporter, route: '/board' });
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: 'Move "Open bug"' }));
    expect(menuItems()).toEqual(['Closed']);
    expect(screen.queryByRole('button', { name: 'Move "Resolved bug"' })).not.toBeInTheDocument();
  });

  it('says how to move a card without telling phone users to drag', async () => {
    renderWithProviders(<KanbanBoard />, { user: USERS.developer, route: '/board' });
    expect(await screen.findByText(/Use a card’s Move menu, or drag it/)).toBeInTheDocument();
  });
});
