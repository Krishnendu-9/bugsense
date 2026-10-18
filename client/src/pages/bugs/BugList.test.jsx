import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BugList from './BugList.jsx';
import api from '../../api/axios.js';
import { downloadFile } from '../../utils/helpers.js';
import { createFakeSocket, renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../api/axios.js', () => ({ default: { get: vi.fn() } }));
vi.mock('../../utils/helpers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadFile: vi.fn(),
}));

const HOUR = 60 * 60 * 1000;
const STATUSES = ['open', 'in-progress', 'resolved', 'closed'];

// Two rows the assertions look at, then 45 fillers: 47 bugs, three pages.
const PERSON = {
  _id: 'p1',
  title: 'Checkout button does nothing',
  status: 'open',
  priority: 'critical',
  project: 'Web',
  source: 'manual',
  occurrences: 1,
  comments: ['c1', 'c2'],
  reporter: { name: 'Ada Lovelace' },
  assignedTo: { name: 'Dev User' },
  topFrame: null,
  updatedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
};
const SDK = {
  _id: 's1',
  title: 'TypeError: cart is undefined',
  status: 'in-progress',
  priority: 'high',
  project: 'Web',
  source: 'sdk',
  occurrences: 12,
  comments: [],
  assignedTo: null,
  fingerprint: 'abcdef1234567890abcdef1234567890',
  topFrame: 'at handleClick (https://shop.example.com/assets/app-1a2b3c.js:10:5)',
  updatedAt: new Date(Date.now() - 30 * HOUR).toISOString(),
};
const FILLERS = Array.from({ length: 45 }, (_, i) => ({
  _id: `f${i}`,
  title: `Filler bug ${i}`,
  status: STATUSES[i % 4],
  priority: 'low',
  project: i % 2 ? 'Web' : 'API',
  source: i % 3 ? 'manual' : 'sdk',
  occurrences: 1,
  comments: [],
  assignedTo: null,
  fingerprint: i % 3 ? null : `ffff${i}`,
  topFrame: null,
  updatedAt: new Date(Date.now() - (i + 1) * 24 * HOUR).toISOString(),
}));
// Every real bug has createdAt; the CSV export writes it.
const ALL = [PERSON, SDK, ...FILLERS].map((b) => ({ ...b, createdAt: b.updatedAt }));

// A stand-in for GET /bugs that really filters and paginates, so the tests
// check what the page shows for what it asked, not just what it asked.
const PROJECT_NAMES = ['API', 'Web'];

const serveBugs = () => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/bugs/stats')) return Promise.resolve({ data: { projectNames: PROJECT_NAMES } });
    const q = new URLSearchParams(url.split('?')[1]);
    let rows = ALL;
    for (const key of ['status', 'priority', 'project', 'source']) {
      if (q.get(key)) rows = rows.filter((b) => b[key] === q.get(key));
    }
    if (q.get('search')) rows = rows.filter((b) => b.title.toLowerCase().includes(q.get('search').toLowerCase()));
    const limit = Number(q.get('limit')) || 20;
    const page = Number(q.get('page')) || 1;
    const pages = Math.max(1, Math.ceil(rows.length / limit));
    return Promise.resolve({
      data: { bugs: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, pages, limit },
    });
  });
};

const listCalls = () => api.get.mock.calls.map((c) => c[0]).filter((url) => url.startsWith('/bugs?'));
const lastListQuery = () => new URLSearchParams(listCalls().at(-1).split('?')[1]);
const row = (title) => screen.getByRole('link', { name: title }).closest('tr');

describe('Bugs list', () => {
  beforeEach(() => {
    api.get.mockReset();
    downloadFile.mockReset();
    serveBugs();
  });

  it('shows bugs as a table with the agreed columns', async () => {
    renderWithProviders(<BugList />, { route: '/bugs' });
    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Bug', 'Status', 'Priority', 'Project', 'Source', 'Updated']);
  });

  it("gives a person's report its discussion and owner, and an SDK bug its grouping evidence", async () => {
    renderWithProviders(<BugList />, { route: '/bugs' });
    await screen.findByRole('table');

    const person = row(PERSON.title);
    expect(within(person).getByText(/2 comments/)).toHaveTextContent(
      'Reported by Ada Lovelace · 2 comments · Assigned to Dev User'
    );
    expect(within(person).getByText('Person')).toBeInTheDocument();
    expect(within(person).queryByText(/^×/)).not.toBeInTheDocument();

    const sdk = row(SDK.title);
    expect(within(sdk).getByText('×12')).toHaveClass('font-mono');
    expect(within(sdk).getByText('abcdef12')).toBeInTheDocument();
    // The URL is cut to the file name on screen; the whole frame is on hover.
    const frame = within(sdk).getByText('at handleClick (app-1a2b3c.js:10:5)');
    expect(frame).toHaveAttribute('title', 'at handleClick (https://shop.example.com/assets/app-1a2b3c.js:10:5)');
    expect(within(sdk).getByText('SDK')).toBeInTheDocument();
    // Updated is days at 24h: 30 hours reads 1d.
    expect(within(sdk).getByText('1d ago')).toHaveClass('font-mono');
  });

  it('marks every status, with priority coloured only when critical or high', async () => {
    renderWithProviders(<BugList />, { route: '/bugs' });
    const table = await screen.findByRole('table');
    for (const tr of within(table).getAllByRole('row').slice(1)) {
      const mark = tr.querySelectorAll('td')[1].querySelector('[aria-hidden="true"]');
      expect(mark?.className).toMatch(/\bbg-/);
    }
    expect(within(row(PERSON.title)).getByText('Critical')).toHaveClass('text-priority-critical');
    expect(within(row('Filler bug 0')).getByText('Low')).toHaveClass('text-muted');
  });

  it('filters by source, and the other filters still filter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BugList />, { route: '/bugs' });
    await screen.findByRole('table');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'sdk');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'in-progress');
    await waitFor(() => expect(lastListQuery().get('source')).toBe('sdk'));
    await waitFor(() => expect(lastListQuery().get('status')).toBe('in-progress'));

    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
    for (const tr of screen.getAllByRole('row').slice(1)) {
      expect(within(tr).getByText('SDK')).toBeInTheDocument();
      expect(within(tr).getByText('In Progress')).toBeInTheDocument();
    }
    expect(screen.getByText(/match these filters/)).toBeInTheDocument();
  });

  it('pages through the results and disables what it cannot do', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BugList />, { route: '/bugs' });
    await screen.findByRole('table');

    const footer = () => screen.getByText(/of/, { selector: 'p' });
    expect(footer()).toHaveTextContent('1–20 of 47');
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(footer()).toHaveTextContent('21–40 of 47'));
    expect(screen.getByRole('button', { name: /Previous/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(footer()).toHaveTextContent('41–47 of 47'));
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('says when filters match nothing, without an empty table, and clears them on request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BugList />, { route: '/bugs?search=no-such-bug' });

    expect(await screen.findByText('No bugs match these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // Two Clear buttons exist (filter row and empty state); the empty state's is the last.
    const clears = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clears.at(-1));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(lastListQuery().get('search')).toBeNull();
  });

  it('offers the projects that exist, and filtering by one filters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BugList />, { route: '/bugs' });
    await screen.findByRole('table');

    const select = screen.getByRole('combobox', { name: 'Project' });
    await waitFor(() =>
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Any project', 'API', 'Web'])
    );

    await user.selectOptions(select, 'API');
    await waitFor(() => expect(lastListQuery().get('project')).toBe('API'));
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
    for (const tr of screen.getAllByRole('row').slice(1)) {
      expect(within(tr).getAllByRole('cell')[3]).toHaveTextContent('API');
    }
  });

  it('keeps a project from the URL selected even when no bug uses it any more', async () => {
    renderWithProviders(<BugList />, { route: '/bugs?project=Legacy' });
    const select = await screen.findByRole('combobox', { name: 'Project' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(4));
    expect(select).toHaveValue('Legacy');
    expect(lastListQuery().get('project')).toBe('Legacy');
  });

  it('has no report button of its own: the top bar already has New bug', async () => {
    renderWithProviders(<BugList />, { route: '/bugs' });
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /new bug|report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new bug|report/i })).not.toBeInTheDocument();
  });

  it('exports every bug the filters select, across pages', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BugList />, { route: '/bugs?source=sdk' });
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /CSV/ }));

    await waitFor(() => expect(downloadFile).toHaveBeenCalledOnce());
    const exportQuery = lastListQuery();
    expect(exportQuery.get('source')).toBe('sdk');
    expect(exportQuery.get('limit')).toBe('100');

    const csvRows = downloadFile.mock.calls[0][0].split('\r\n').slice(1);
    const expected = ALL.filter((b) => b.source === 'sdk');
    expect(csvRows).toHaveLength(expected.length);
    // toCsvCell quotes cells, so match the Source cell with or without quotes.
    expect(csvRows.every((r) => /,"?sdk"?,/.test(r))).toBe(true);
    expect(csvRows.some((r) => /,"?manual"?,/.test(r))).toBe(false);
  });
});

describe('Bugs list live updates (ordered by last activity)', () => {
  const titles = () => screen.getAllByRole('row').slice(1).map((tr) => within(tr).getAllByRole('link')[0].textContent);
  const now = () => new Date().toISOString();

  beforeEach(() => {
    api.get.mockReset();
    serveBugs();
  });

  it('moves a bug with new activity to the top of page 1, from this page or a later one, with no request', async () => {
    const socket = createFakeSocket();
    renderWithProviders(<BugList />, { route: '/bugs', socket });
    await screen.findByRole('table');
    const requests = listCalls().length;

    act(() => socket.serverEmit('bug:updated', { ...FILLERS[5], updatedAt: now() }));
    expect(titles()[0]).toBe('Filler bug 5');
    expect(titles()).toHaveLength(20);

    // From page 2: it lands on top, and the row it pushes past 20 belongs to page 2 now.
    act(() => socket.serverEmit('bug:updated', { ...FILLERS[30], updatedAt: now() }));
    expect(titles()[0]).toBe('Filler bug 30');
    expect(titles()).toHaveLength(20);
    expect(titles()).not.toContain('Filler bug 17');

    expect(listCalls().length).toBe(requests);
  });

  it('puts a new bug on top of page 1, keeps the page at 20 rows and counts it', async () => {
    const socket = createFakeSocket();
    renderWithProviders(<BugList />, { route: '/bugs', socket });
    await screen.findByRole('table');

    act(() =>
      socket.serverEmit('bug:created', {
        ...FILLERS[0], _id: 'new1', title: 'Brand new bug', createdAt: now(), updatedAt: now(),
      })
    );
    expect(titles()[0]).toBe('Brand new bug');
    expect(titles()).toHaveLength(20);
    expect(screen.getByText(/of/, { selector: 'p' })).toHaveTextContent('1–20 of 48');
  });

  it('re-fetches other views quietly: once per burst, never swapping the table for a skeleton', async () => {
    const socket = createFakeSocket();
    renderWithProviders(<BugList />, { route: '/bugs?source=sdk', socket });
    const table = await screen.findByRole('table');
    const requests = listCalls().length;

    act(() => {
      for (let i = 0; i < 5; i += 1) socket.serverEmit('bug:updated', { ...SDK, occurrences: 13 + i, updatedAt: now() });
    });

    await waitFor(() => expect(listCalls().length).toBe(requests + 1), { timeout: 3000 });
    // waitFor passes the moment the count goes through +1, so let a further
    // throttle window elapse: five events must have cost one request, not five.
    await new Promise((r) => setTimeout(r, 1700));
    expect(listCalls().length).toBe(requests + 1);
    expect(lastListQuery().get('source')).toBe('sdk');
    // Still the same table element: the refresh never showed the loading state.
    await waitFor(() => expect(table.isConnected).toBe(true));
    expect(screen.queryByLabelText('Loading bugs')).not.toBeInTheDocument();
  });
});
