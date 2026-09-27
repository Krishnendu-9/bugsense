import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BugForm from './BugForm.jsx';
import { renderWithProviders, USERS } from '../../test/renderWithProviders.jsx';

// Quill needs real browser layout APIs; a textarea stands in for it here.
vi.mock('react-quill-new', () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea aria-label="Description" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('react-quill-new/dist/quill.snow.css', () => ({}));

const fillRequired = async (user) => {
  await user.type(screen.getByLabelText(/Title/), 'Cart total shows NaN');
  await user.type(screen.getByLabelText('Description'), 'Removing an item breaks the total.');
};

describe('BugForm', () => {
  it('requires a title and a non-blank description', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<BugForm onSubmit={onSubmit} />, { user: USERS.reporter });

    await user.type(screen.getByLabelText('Description'), '   ');
    await user.click(screen.getByRole('button', { name: 'Submit Bug' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Description is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hides the Status field from reporters and never submits a status for them', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<BugForm onSubmit={onSubmit} />, { user: USERS.reporter });

    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Submit Bug' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('status');
  });

  it('lets staff set a status', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<BugForm onSubmit={onSubmit} />, { user: USERS.developer });

    await fillRequired(user);
    await user.selectOptions(screen.getByLabelText('Status'), 'in-progress');
    await user.click(screen.getByRole('button', { name: 'Submit Bug' }));

    expect(onSubmit.mock.calls[0][0].status).toBe('in-progress');
  });

  it('collects numbered steps, tags and browser info', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<BugForm onSubmit={onSubmit} />, { user: USERS.reporter });

    await fillRequired(user);
    const stepInput = screen.getByPlaceholderText(/Add a reproduction step/);
    await user.type(stepInput, 'Add two items{Enter}');
    await user.type(stepInput, 'Remove one{Enter}');
    await user.type(screen.getByLabelText('Tags'), 'Checkout{Enter}checkout{Enter}');
    await user.click(screen.getByRole('button', { name: 'Submit Bug' }));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.steps).toEqual(['Add two items', 'Remove one']);
    expect(payload.tags).toEqual(['checkout']);
    expect(payload.browserInfo).toEqual(expect.objectContaining({ userAgent: navigator.userAgent }));
  });

  it('rejects screenshots that are not supported images', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWithProviders(<BugForm onSubmit={vi.fn()} />, { user: USERS.reporter });

    const input = document.querySelector('input[type="file"]');
    await user.upload(input, new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));

    expect(screen.queryByAltText('Screenshot preview')).not.toBeInTheDocument();
  });
});
