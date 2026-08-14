/**
 * Component tests — ReportCase submission form.
 * Pattern to copy for other component tests.
 *
 * The API module is mocked, so no network call is made. We assert on what the
 * user sees (validation messages) and on whether the submit call happened.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ReportCase from '../pages/ReportCase';
import { submitReport } from '../api/client';

// Mock the API layer — components must never call it directly, and here we
// only care whether the form decided to submit.
vi.mock('../api/client', () => ({
  submitReport: vi
    .fn()
    .mockResolvedValue({ data: { data: { reference_code: 'JN-TEST1234' } } }),
}));

function renderForm() {
  return render(
    <MemoryRouter>
      <ReportCase />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  submitReport.mockClear();
});

describe('ReportCase', () => {
  it('shows a validation message for a missing required field and does not submit', async () => {
    const user = userEvent.setup();
    renderForm();

    // Submit with the form empty.
    await user.click(screen.getByRole('button', { name: /submit report/i }));

    // A validation message appears...
    expect(await screen.findByText('Please select a case type.')).toBeInTheDocument();
    // ...and the API was never called.
    expect(submitReport).not.toHaveBeenCalled();
  });

  it('submits only once every required field is valid', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(
      screen.getByLabelText('What kind of incident is this?'),
      'land_dispute',
    );
    await user.selectOptions(screen.getByLabelText('Which district?'), 'Jaffna');
    await user.type(
      screen.getByLabelText('What happened?'),
      'A neighbour fenced off part of the access road.',
    );

    await user.click(screen.getByRole('button', { name: /submit report/i }));

    expect(submitReport).toHaveBeenCalledTimes(1);
  });
});
