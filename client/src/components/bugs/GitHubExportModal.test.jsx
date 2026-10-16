import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GitHubExportModal from './GitHubExportModal.jsx';
import api from '../../api/axios.js';

vi.mock('../../api/axios.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

describe('GitHubExportModal', () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue({ data: { repos: ['acme/web'] } });
    api.post.mockReset().mockResolvedValue({ data: { githubIssue: { url: 'https://github.com/acme/web/issues/1', issueNumber: 1 } } });
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GitHubExportModal bugId="b1" onClose={onClose} onExported={vi.fn()} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('fills the form from an allowlisted repository and exports without a token', async () => {
    const onExported = vi.fn();
    const user = userEvent.setup();
    render(<GitHubExportModal bugId="b1" onClose={vi.fn()} onExported={onExported} />);

    await user.click(await screen.findByRole('button', { name: 'acme/web' }));
    await user.click(screen.getByRole('button', { name: 'Create GitHub Issue' }));

    expect(api.post).toHaveBeenCalledWith('/bugs/b1/github', { repoOwner: 'acme', repoName: 'web', githubToken: undefined });
    expect(onExported).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 1 }));
  });

  it('validates the repository before calling the API', async () => {
    const user = userEvent.setup();
    render(<GitHubExportModal bugId="b1" onClose={vi.fn()} onExported={vi.fn()} />);

    await user.type(screen.getByLabelText('Repository Owner'), '../../etc');
    await user.type(screen.getByLabelText('Repository Name'), 'repo');
    await user.click(screen.getByRole('button', { name: 'Create GitHub Issue' }));

    expect(await screen.findByText('Letters, numbers and dashes only')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
