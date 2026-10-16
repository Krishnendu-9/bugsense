import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import Register from './Register.jsx';
import api from '../../api/axios.js';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../api/axios.js', () => ({ default: { get: vi.fn() } }));

const roleOptions = () =>
  within(screen.getByLabelText(/Role/)).getAllByRole('option').map((o) => o.value);

describe('Register', () => {
  it('offers Developer when the server allows developer sign-up', async () => {
    api.get.mockResolvedValue({ data: { developerSignup: true } });
    renderWithProviders(<Register />, { user: null });

    expect(await screen.findByRole('option', { name: 'Developer' })).toBeInTheDocument();
    expect(roleOptions()).toEqual(['reporter', 'developer']);
  });

  it('offers only Reporter when developer sign-up is disabled', async () => {
    api.get.mockResolvedValue({ data: { developerSignup: false } });
    renderWithProviders(<Register />, { user: null });

    expect(await screen.findByText(/Developer access is granted by an admin/)).toBeInTheDocument();
    expect(roleOptions()).toEqual(['reporter']);
  });

  it('falls back to Reporter only if the config request fails', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    renderWithProviders(<Register />, { user: null });

    expect(await screen.findByText(/Developer access is granted by an admin/)).toBeInTheDocument();
    expect(roleOptions()).toEqual(['reporter']);
  });
});
