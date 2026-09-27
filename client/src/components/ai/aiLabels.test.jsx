import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorInsights from './ErrorInsights.jsx';
import GitPatchModal from './GitPatchModal.jsx';
import PostMortemModal from './PostMortemModal.jsx';

// Fallback output must never be presented as model output.
describe('ErrorInsights labelling', () => {
  const insights = { possibleCause: 'Null reference', suggestedFix: 'Guard the access' };

  it('labels model output as AI analysis', () => {
    render(<ErrorInsights insights={{ ...insights, source: 'claude' }} />);
    expect(screen.getByRole('heading', { name: 'AI Analysis' })).toBeInTheDocument();
    expect(screen.queryByText(/not a model diagnosis/)).not.toBeInTheDocument();
  });

  it('labels the keyword fallback as heuristic, with an explanation', () => {
    render(<ErrorInsights insights={{ ...insights, source: 'heuristic' }} />);
    expect(screen.getByRole('heading', { name: 'Heuristic Analysis' })).toBeInTheDocument();
    expect(screen.getByText(/not a model diagnosis/)).toBeInTheDocument();
  });

  it('shows a skeleton while loading and nothing without insights', () => {
    const { container, rerender } = render(<ErrorInsights isLoading />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);

    rerender(<ErrorInsights insights={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('GitPatchModal', () => {
  it('shows the explanation and no diff or copy button when no patch was generated', () => {
    render(
      <GitPatchModal
        patch={{ diff: '', source: 'unavailable', explanation: 'AI patch generation needs ANTHROPIC_API_KEY.' }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('No patch available')).toBeInTheDocument();
    expect(screen.getByText(/needs ANTHROPIC_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy/ })).not.toBeInTheDocument();
  });

  it('renders a real diff with copy controls', () => {
    render(
      <GitPatchModal
        patch={{ diff: '--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-bad\n+good', source: 'claude', explanation: 'Fix' }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('+good')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Git Patch/ })).toBeInTheDocument();
  });
});

describe('PostMortemModal', () => {
  it('flags template output as not AI-written', () => {
    render(<PostMortemModal markdown="# Incident" source="template" onClose={() => {}} />);
    expect(screen.getByText(/not written by AI/)).toBeInTheDocument();
  });

  it('shows no template notice for model output', () => {
    render(<PostMortemModal markdown="# Incident" source="claude" onClose={() => {}} />);
    expect(screen.queryByText(/not written by AI/)).not.toBeInTheDocument();
  });
});
