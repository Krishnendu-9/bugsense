import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import Dashboard from './Dashboard.jsx';
import api from '../../api/axios.js';
import { renderWithProviders, USERS } from '../../test/renderWithProviders.jsx';

vi.mock('../../api/axios.js', () => ({ default: { get: vi.fn() } }));

// Recharts' ResponsiveContainer measures with ResizeObserver, which jsdom
// lacks. Defined for the whole file, not per test: the chart's effect can run
// after a test's own teardown.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const HOUR = 60 * 60 * 1000;

const stats = (overrides = {}) => ({
  total: 4,
  open: 2,
  inProgress: 1,
  resolved: 1,
  closed: 0,
  byPriority: [
    { _id: 'critical', count: 1 },
    { _id: 'high', count: 1 },
    { _id: 'medium', count: 1 },
    { _id: 'low', count: 1 },
  ],
  projects: 2,
  oldestOpenAt: new Date(Date.now() - 30 * HOUR).toISOString(),
  recent: [
    {
      _id: 'b1',
      title: 'Checkout crashes on submit',
      status: 'in-progress',
      priority: 'critical',
      project: 'Web',
      source: 'sdk',
      occurrences: 12,
      assignedTo: { name: 'Dev User' },
      updatedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    },
    {
      _id: 'b2',
      title: 'Typo on the pricing page',
      status: 'open',
      priority: 'low',
      project: '',
      source: 'manual',
      occurrences: 1,
      assignedTo: null,
      updatedAt: new Date(Date.now() - 5 * HOUR).toISOString(),
    },
  ],
  ...overrides,
});

const trends = (overrides = {}) => ({
  openByDay: {
    timezone: 'UTC',
    days: [1, 2, 3, 1, 2, 2, 2].map((open, i) => ({ date: `2026-10-${String(12 + i).padStart(2, '0')}`, open })),
  },
  timeToResolve: { medianMs: 30 * HOUR, sampleSize: 1 },
  resolvedInWindow: { since: '2026-10-12T00:00:00.000Z', count: 1 },
  ...overrides,
});

const telemetry = (overrides = {}) => ({
  sdkCrashesReceived: 40,
  sdkIncidents: 8,
  duplicatesMerged: 32,
  dedupRate: 80,
  ...overrides,
});

// Routes each GET to a response; a value of Error rejects.
const serve = (routes) => {
  api.get.mockImplementation((url) => {
    const body = routes[url];
    if (body instanceof Error) return Promise.reject(body);
    if (body === undefined) return Promise.reject(new Error(`unexpected GET ${url}`));
    return Promise.resolve({ data: body });
  });
};

const card = (label) => screen.getByText(label, { selector: 'p' }).parentElement;

describe('Overview', () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  it('shows the figures the API returned', async () => {
    serve({
      '/bugs/stats': stats(),
      '/bugs/stats/trends': trends(),
      '/health/metrics': { telemetry: telemetry() },
    });
    renderWithProviders(<Dashboard />);

    expect(await screen.findByText(/^4 bugs · 2 projects · updated \d\d:\d\d$/)).toBeInTheDocument();
    expect(within(card('Total')).getByText('4')).toBeInTheDocument();
    expect(within(card('Open')).getByText('oldest 1d')).toBeInTheDocument();
    expect(within(card('Median time to resolve')).getByText('30h')).toBeInTheDocument();
    expect(within(card('Median time to resolve')).getByText('across 1 resolved bug')).toBeInTheDocument();
    expect(within(card('Resolved')).getByText('1')).toBeInTheDocument();

    const trend = screen.getByRole('heading', { name: 'Open bugs this week' }).closest('section');
    expect(within(trend).getByText(/Peak/).textContent).toMatch(/Peak 3/);
    expect(within(trend).getByText(/Peak/).textContent).toMatch(/Now 2/);

    const dedup = screen.getByRole('heading', { name: 'Deduplication' }).closest('section');
    expect(within(dedup).getByText('40')).toBeInTheDocument();
    expect(within(dedup).getByText('8')).toBeInTheDocument();
    expect(within(dedup).getByText('80% of crashes merged into an existing bug.')).toBeInTheDocument();
  });

  it('shows a dash and the reason, never a zero, when a value does not exist', async () => {
    serve({
      '/bugs/stats': stats({ oldestOpenAt: null, open: 0 }),
      '/bugs/stats/trends': trends({ timeToResolve: { medianMs: null, sampleSize: 0 } }),
      '/health/metrics': {
        telemetry: telemetry({ sdkCrashesReceived: 0, sdkIncidents: 0, duplicatesMerged: 0, dedupRate: null }),
      },
    });
    renderWithProviders(<Dashboard />);

    const median = await waitFor(() => card('Median time to resolve'));
    expect(within(median).getByText('—')).toBeInTheDocument();
    expect(within(median).getByText('No bug has been resolved yet.')).toBeInTheDocument();
    expect(within(card('Open')).getByText('No open bugs.')).toBeInTheDocument();

    const dedup = screen.getByRole('heading', { name: 'Deduplication' }).closest('section');
    expect(within(dedup).getByText('No SDK crashes received yet, so there is no rate.')).toBeInTheDocument();
    expect(within(dedup).getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'No rate');
  });

  it('says a failed load failed instead of rendering it as zeros', async () => {
    serve({
      '/bugs/stats': new Error('boom'),
      '/bugs/stats/trends': trends(),
      '/health/metrics': { telemetry: telemetry() },
    });
    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Could not load statistics.', { selector: 'header p' })).toBeInTheDocument();
    for (const label of ['Total', 'Open']) {
      expect(within(card(label)).getByText('—')).toBeInTheDocument();
      expect(within(card(label)).queryByText('0')).not.toBeInTheDocument();
    }
    const priority = screen.getByRole('heading', { name: 'By priority' }).closest('section');
    expect(within(priority).getByText('Could not load statistics.')).toBeInTheDocument();
    const status = screen.getByRole('heading', { name: 'By status' }).closest('section');
    expect(within(status).queryByText('No bugs reported yet.')).not.toBeInTheDocument();
    expect(screen.getByText('Could not load recent bugs.')).toBeInTheDocument();

    // The other endpoints are independent and still render.
    expect(within(card('Median time to resolve')).getByText('30h')).toBeInTheDocument();
  });

  it('does not ask a reporter for staff-only telemetry, and says why it is absent', async () => {
    serve({ '/bugs/stats': stats(), '/bugs/stats/trends': trends() });
    renderWithProviders(<Dashboard />, { user: USERS.reporter });

    const dedup = (await screen.findByRole('heading', { name: 'Deduplication' })).closest('section');
    expect(within(dedup).getByText('Shown to developers and admins.')).toBeInTheDocument();
    expect(within(dedup).getAllByText('—')).toHaveLength(2);
    expect(api.get).not.toHaveBeenCalledWith('/health/metrics');
  });

  it('lists recent bugs as a table, badging SDK occurrences only', async () => {
    serve({
      '/bugs/stats': stats(),
      '/bugs/stats/trends': trends(),
      '/health/metrics': { telemetry: telemetry() },
    });
    renderWithProviders(<Dashboard />);

    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Bug', 'Status', 'Priority', 'Project', 'Assignee', 'Updated']);

    const [, sdkRow, manualRow] = within(table).getAllByRole('row');
    expect(within(sdkRow).getByText('×12')).toBeInTheDocument();
    expect(within(sdkRow).getByText('In Progress')).toBeInTheDocument();
    expect(within(sdkRow).getByText('Critical')).toHaveClass('text-priority-critical');
    expect(within(sdkRow).getByText('3h ago')).toBeInTheDocument();
    expect(within(manualRow).queryByText(/^×/)).not.toBeInTheDocument();
    expect(within(manualRow).getByText('Low')).toHaveClass('text-muted');
    expect(within(manualRow).getByText('Unassigned')).toBeInTheDocument();
  });
});
