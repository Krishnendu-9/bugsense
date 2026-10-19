import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '../../test/user.js';
import AIAnalyzer from './AIAnalyzer.jsx';
import api from '../../api/axios.js';

vi.mock('../../api/axios.js', () => ({ default: { post: vi.fn() } }));

describe('AIAnalyzer', () => {
  beforeEach(() => {
    api.post.mockReset();
    api.post.mockResolvedValue({
      data: { possibleCause: 'Null reference', suggestedFix: 'Guard the access', source: 'claude' },
    });
  });

  it('enables Analyze for typed text and sends it', async () => {
    const user = setupUser();
    render(<AIAnalyzer />);

    const analyzeButton = screen.getByRole('button', { name: /Analyze with AI/ });
    expect(analyzeButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Error Log/), 'TypeError: x is undefined');
    expect(screen.getByText('25 chars')).toBeInTheDocument();
    expect(analyzeButton).toBeEnabled();

    await user.click(analyzeButton);

    expect(api.post).toHaveBeenCalledWith('/ai/analyze', expect.objectContaining({ errorLog: 'TypeError: x is undefined' }));
    expect(await screen.findByText('Null reference')).toBeInTheDocument();
  });

  it('enables Analyze for pasted text', async () => {
    const user = setupUser();
    render(<AIAnalyzer />);

    await user.click(screen.getByLabelText(/Error Log/));
    await user.paste('ReferenceError: foo is not defined');

    expect(screen.getByRole('button', { name: /Analyze with AI/ })).toBeEnabled();
  });

  it('loads an example error', async () => {
    const user = setupUser();
    render(<AIAnalyzer />);

    await user.click(screen.getByRole('button', { name: 'JWT verification failed' }));

    expect(screen.getByLabelText(/Error Log/).value).toContain('invalid signature');
    expect(screen.getByRole('button', { name: /Analyze with AI/ })).toBeEnabled();
  });
});
