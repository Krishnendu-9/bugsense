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

describe('BugDetail layout', () => {
  const sdkBug = () => ({
    ...baseBug(),
    source: 'sdk',
    reporter: null,
    description: 'Crash reported automatically by the BugSense SDK.',
    steps: [],
    occurrences: 6,
    fingerprint: '3e070587aa11bb22cc33dd44ee55ff66',
    firstSeenAt: '2026-09-14T12:00:00.000Z',
    lastSeenAt: '2026-09-19T15:10:00.000Z',
    status: 'in-progress',
    statusHistory: [
      { status: 'resolved', changedBy: { _id: 'd1', name: 'Dev User' }, changedAt: '2026-09-15T10:00:00.000Z', note: 'Fixed' },
      { status: 'in-progress', changedAt: '2026-09-19T15:10:00.000Z', note: 'Regression auto-detected' },
    ],
  });

  const serve = (bug) => {
    api.get.mockReset().mockImplementation(async (url) => {
      if (url === '/bugs/b1') return { data: bug };
      return { data: [] };
    });
  };

  it('puts the regression, count and fingerprint in the banner, and drops what says nothing', async () => {
    serve(sdkBug());
    await renderDetail();

    const banner = screen.getByRole('region', { name: 'Crash summary' });
    expect(within(banner).getByText(/Regressed .* after being resolved by Dev User on Sep 15, 2026/)).toBeInTheDocument();
    expect(within(banner).getByText('occurrences')).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Copy fingerprint 3e070587aa11bb22cc33dd44ee55ff66' })).toHaveTextContent('3e070587');

    // The SDK placeholder description, the SDK "reporter" card and the Timeline card are gone.
    expect(screen.queryByText('Crash reported automatically by the BugSense SDK.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reporter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Timeline' })).not.toBeInTheDocument();
  });

  it('keeps a real description and the reporter card for a person’s report, with no crash banner', async () => {
    serve(baseBug());
    await renderDetail();

    expect(screen.getByText('Nothing happens on click')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reporter' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Crash summary' })).not.toBeInTheDocument();
  });

  it('keeps Triage inline and moves the rest, Delete included, into More actions', async () => {
    serve(baseBug());
    await renderDetail(USERS.admin);
    const user = setupUser();

    expect(screen.getByRole('button', { name: 'Triage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['AI PR fix', 'Export to GitHub', 'Post-mortem', 'Edit details', 'Delete bug']);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus();
  });
});
