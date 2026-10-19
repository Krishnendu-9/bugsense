import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { setupUser } from '../../test/user.js';
import BugDetail from './BugDetail.jsx';
import api from '../../api/axios.js';
import { createFakeSocket, renderWithProviders, USERS } from '../../test/renderWithProviders.jsx';

vi.mock('../../api/axios.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const NOW = '2026-09-20T10:00:00.000Z';

const baseBug = () => ({
  _id: 'b1',
  title: 'Checkout button broken',
  description: '<p>Nothing happens on click</p>',
  status: 'open',
  priority: 'high',
  severity: 'major',
  reporter: { _id: USERS.reporter._id, name: USERS.reporter.name, email: USERS.reporter.email },
  assignedTo: null,
  statusHistory: [],
  steps: ['Open the cart'],
  tags: [],
  comments: [],
  createdAt: NOW,
  updatedAt: NOW,
});

const comment = (id, author = USERS.developer) => ({
  _id: id,
  bug: 'b1',
  author: { _id: author._id, name: author.name },
  content: `Comment ${id}`,
  createdAt: NOW,
});

const renderDetail = async (user = USERS.developer) => {
  const socket = createFakeSocket();
  renderWithProviders(<BugDetail />, { user, route: '/bugs/b1', path: '/bugs/:id', socket });
  await screen.findByRole('heading', { name: 'Checkout button broken' });
  return socket;
};

describe('BugDetail real-time behaviour', () => {
  beforeEach(() => {
    api.get.mockReset().mockImplementation(async (url) => {
      if (url === '/bugs/b1') return { data: baseBug() };
      if (url === '/comments/bug/b1') return { data: [] };
      return { data: [] };
    });
    api.post.mockReset();
  });

  it('joins the bug room and merges live updates without dropping fields', async () => {
    const socket = await renderDetail();
    expect(socket.emitted).toContainEqual(['join:bug', 'b1']);

    act(() => {
      socket.serverEmit('bug:detail:updated', {
        _id: 'b1',
        status: 'in-progress',
        statusHistory: [{ status: 'in-progress', changedBy: { _id: 'someone', name: 'Ada' }, changedAt: NOW }],
      });
    });

    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getByText('by Ada')).toBeInTheDocument();
    // Fields the event did not carry are kept.
    expect(screen.getByText('Open the cart')).toBeInTheDocument();
  });

  it('ignores updates for other bugs', async () => {
    const socket = await renderDetail();
    act(() => socket.serverEmit('bug:detail:updated', { _id: 'other', title: 'Something else' }));
    expect(screen.getByRole('heading', { name: 'Checkout button broken' })).toBeInTheDocument();
  });

  it('adds each live comment once, even when it also arrives from our own POST', async () => {
    const socket = await renderDetail();
    const mine = comment('c1', USERS.developer);
    api.post.mockResolvedValue({ data: mine });

    await setupUser().type(screen.getByLabelText('Add a comment'), 'Comment c1');
    await setupUser().click(screen.getByRole('button', { name: 'Post comment' }));
    act(() => socket.serverEmit('comment:added', mine));
    act(() => socket.serverEmit('comment:added', comment('c2', USERS.admin)));
    act(() => socket.serverEmit('comment:added', comment('c2', USERS.admin)));

    expect(screen.getAllByText('Comment c1')).toHaveLength(1);
    expect(screen.getAllByText('Comment c2')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Comments (2)' })).toBeInTheDocument();

    act(() => socket.serverEmit('comment:deleted', { _id: 'c2', bugId: 'b1' }));
    expect(screen.queryByText('Comment c2')).not.toBeInTheDocument();
  });

  it('leaves the page when the bug is deleted', async () => {
    const socket = await renderDetail();
    act(() => socket.serverEmit('bug:deleted', { _id: 'b1' }));
    expect(await screen.findByText('Navigated away')).toBeInTheDocument();
  });

  it('offers the reporter only close for an open bug, and no priority', async () => {
    await renderDetail(USERS.reporter);
    await setupUser().click(screen.getByRole('button', { name: 'Status' }));

    const options = within(screen.getByLabelText('Status')).getAllByRole('option').map((o) => o.value);
    expect(options).toEqual(['open', 'closed']);
    expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument();
  });
});
