import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import Navbar from './Navbar.jsx';
import { createFakeSocket, renderWithProviders } from '../../test/renderWithProviders.jsx';

describe('Navbar', () => {
  it('has exactly one primary action, New bug, linking to the report form', () => {
    const { container } = renderWithProviders(<Navbar onOpenMenu={() => {}} />);

    const newBug = screen.getByRole('link', { name: 'New bug' });
    expect(newBug).toHaveAttribute('href', '/report');
    expect(newBug).toHaveClass('btn-primary');
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(container.querySelectorAll('a[href="/report"]')).toHaveLength(1);
  });

  it('shows the connection as a bare dot and a word, with no pill', () => {
    renderWithProviders(<Navbar onOpenMenu={() => {}} />, { socket: createFakeSocket() });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Live');
    expect(status.className).not.toMatch(/\b(border|rounded-full|bg-)/);
    expect(status.className).toMatch(/\btext-muted\b/);
  });

  it('says Offline when the socket is not connected', () => {
    renderWithProviders(<Navbar onOpenMenu={() => {}} />, { socket: null });
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });

  it('keeps search with its keyboard hint', () => {
    renderWithProviders(<Navbar onOpenMenu={() => {}} />);
    expect(screen.getByRole('searchbox', { name: 'Search bugs' })).toBeInTheDocument();
    expect(screen.getByText(/K$/, { selector: 'kbd' })).toBeInTheDocument();
  });
});
