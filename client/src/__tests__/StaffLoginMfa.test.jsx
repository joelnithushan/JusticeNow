/**
 * Component tests — Staff login two-factor (2FA) step.
 *
 * The API and Supabase modules are mocked, so no network call is made. We drive
 * the two-step flow the way a staffer would: password step returns
 * mfa_required, then the code-entry step verifies and stores the session.
 * A code is never asserted against a log — we only check the calls and the UI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StaffLogin from '../pages/StaffLogin';
import { AuthProvider } from '../context/AuthContext';
import { loginStaff, staffLoginMfa } from '../api/client';

vi.mock('../api/client', () => ({
  loginStaff: vi.fn(),
  loginStaffGoogle: vi.fn(),
  staffLoginMfa: vi.fn(),
}));

// Supabase is only used for the Google flow; stub it so importing StaffLogin
// doesn't try to reach a real client (getSession is awaited in an effect).
vi.mock('../api/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signOut: vi.fn().mockResolvedValue({}),
      signInWithOAuth: vi.fn().mockResolvedValue({}),
    },
  },
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <StaffLogin />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loginStaff.mockReset();
  staffLoginMfa.mockReset();
});

describe('StaffLogin 2FA', () => {
  it('shows the code-entry step when the password login requires 2FA', async () => {
    const user = userEvent.setup();
    loginStaff.mockResolvedValue({
      data: { data: { mfa_required: true, mfa_token: 'challenge-1' } },
    });
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'officer@ngo.org');
    await user.type(screen.getByLabelText('Password'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // The code-entry step appears; the session was NOT stored (no token yet).
    expect(await screen.findByLabelText('Authentication code')).toBeInTheDocument();
    expect(staffLoginMfa).not.toHaveBeenCalled();
  });

  it('verifies the code with the mfa_token from the first step', async () => {
    const user = userEvent.setup();
    loginStaff.mockResolvedValue({
      data: { data: { mfa_required: true, mfa_token: 'challenge-1' } },
    });
    staffLoginMfa.mockResolvedValue({
      data: { data: { token: 'jwt-abc', staff: { id: 1, role: 'officer' } } },
    });
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'officer@ngo.org');
    await user.type(screen.getByLabelText('Password'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await user.type(await screen.findByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(staffLoginMfa).toHaveBeenCalledWith('challenge-1', '123456');
  });

  it('shows a generic error and keeps the code step on a bad code', async () => {
    const user = userEvent.setup();
    loginStaff.mockResolvedValue({
      data: { data: { mfa_required: true, mfa_token: 'challenge-1' } },
    });
    staffLoginMfa.mockRejectedValue(new Error('nope'));
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'officer@ngo.org');
    await user.type(screen.getByLabelText('Password'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await user.type(await screen.findByLabelText('Authentication code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not verify the code. Please try again.',
    );
    // Still on the code step so the staffer can retry.
    expect(screen.getByLabelText('Authentication code')).toBeInTheDocument();
  });
});
