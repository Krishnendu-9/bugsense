import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownView from './MarkdownView.jsx';

describe('MarkdownView', () => {
  it('renders the parts of a post-mortem', () => {
    render(
      <MarkdownView
        markdown={'# Incident\n\n## Root Cause\nA **null** read in `Cart`.\n\n- first\n- second\n\n1. [ ] Add a test\n2. [x] Ship the fix\n\n---\n> quoted'}
      />
    );
    expect(screen.getByRole('heading', { name: 'Incident' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Root Cause' })).toBeInTheDocument();
    expect(screen.getByText('null').tagName).toBe('STRONG');
    expect(screen.getByText('Cart').tagName).toBe('CODE');
    expect(screen.getByText('first').closest('ul')).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Ship the fix' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Add a test' })).not.toBeChecked();
  });

  it('shows markup as text instead of rendering it', () => {
    const { container } = render(<MarkdownView markdown={'<img src=x onerror=alert(1)> and <script>x</script>'} />);
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('links only to http(s) addresses', () => {
    render(<MarkdownView markdown={'[docs](https://example.com) and [bad](javascript:alert(1))'} />);
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com');
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
  });
});
