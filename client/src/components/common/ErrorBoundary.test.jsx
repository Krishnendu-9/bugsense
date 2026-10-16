import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary.jsx';

function Bomb({ explode, message = 'Kaboom' }) {
  if (explode) throw new Error(message);
  return <p>Page content</p>;
}

describe('ErrorBoundary (page variant)', () => {
  let fetchMock;
  let consoleError;
  // jsdom reports errors thrown during render as uncaught window errors even
  // though the boundary handles them; marking them handled keeps output clean.
  const swallow = (event) => event.preventDefault();

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    // React logs caught render errors; keep the test output readable.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.addEventListener('error', swallow);
  });

  afterEach(() => {
    window.removeEventListener('error', swallow);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    consoleError.mockRestore();
  });

  it('contains a crash to the page and clears it when the route changes', () => {
    const { rerender } = render(
      <ErrorBoundary variant="page" resetKey="/bugs/1"><Bomb explode /></ErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: 'This page crashed' })).toBeInTheDocument();
    expect(screen.getByText(/Kaboom/)).toBeInTheDocument();

    rerender(<ErrorBoundary variant="page" resetKey="/dashboard"><Bomb explode={false} /></ErrorBoundary>);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('retries the page on Try Again', async () => {
    let explode = true;
    const Flaky = () => <Bomb explode={explode} message="Flaky failure" />;
    render(<ErrorBoundary variant="page" resetKey="/x"><Flaky /></ErrorBoundary>);

    explode = false;
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('reports the crash to BugSense itself when self-reporting is on', async () => {
    vi.stubEnv('VITE_SELF_REPORT', 'true');
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
    render(<ErrorBoundary variant="page" resetKey="/y"><Bomb explode message="Reported failure" /></ErrorBoundary>);

    expect(await screen.findByText(/reported to BugSense automatically/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/api/telemetry/report');
    const body = JSON.parse(init.body);
    expect(body.title).toBe('Error: Reported failure');
    expect(body.project).toBe('BugSense Dashboard');
    expect(body.errorLog).toContain('Component stack');
  });

  it('sends nothing when self-reporting is off', async () => {
    vi.stubEnv('VITE_SELF_REPORT', 'false');
    render(<ErrorBoundary variant="page" resetKey="/z"><Bomb explode message="Silent failure" /></ErrorBoundary>);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'This page crashed' })).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
