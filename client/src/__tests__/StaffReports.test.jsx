/**
 * Component tests — StaffReports list page.
 *
 * The API is mocked so we can exercise loading, empty, error, filter and
 * expand behaviour without a running server or Supabase credentials.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StaffReports from '../pages/StaffReports';
import { fetchReports } from '../api/client';

vi.mock('../api/client', () => ({
  fetchReports: vi.fn(),
}));

// StaffReports renders <StaffHeader>, which calls useAuth(). Mock the auth
// context so these tests stay isolated to the reports list — they need a
// signed-in staff user, not a real Supabase session (and no Supabase env).
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'staff@example.test' },
    session: {},
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const sampleReports = [
  {
    id: 1,
    reference_code: 'JN-ABCDEFGH',
    case_type: 'harassment',
    district: 'Colombo',
    incident_date: '2026-01-15',
    status: 'received',
    created_at: '2026-02-01T10:00:00.000Z',
    description: 'Short description.',
  },
  {
    id: 2,
    reference_code: 'JN-HIJKLMNO',
    case_type: 'land_dispute',
    district: 'Jaffna',
    incident_date: null,
    status: 'under_review',
    created_at: '2026-02-02T10:00:00.000Z',
    description:
      'A neighbour fenced off part of the access road without permission. ' +
      'This has blocked our family from reaching the main road for several weeks ' +
      'and we have no other safe route.',
  },
];

function renderPage() {
  return render(<StaffReports />);
}

beforeEach(() => {
  fetchReports.mockReset();
});

describe('StaffReports', () => {
  it('shows a loading state while fetching', () => {
    fetchReports.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the empty state when there are no reports', async () => {
    fetchReports.mockResolvedValue({ data: { data: [] } });
    renderPage();
    expect(await screen.findByText('No reports yet')).toBeInTheDocument();
  });

  it('shows an error state with a retry button', async () => {
    fetchReports.mockRejectedValueOnce(new Error('network'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('retries loading when the user clicks Try again', async () => {
    const user = userEvent.setup();
    fetchReports.mockRejectedValueOnce(new Error('network'));
    fetchReports.mockResolvedValueOnce({ data: { data: sampleReports } });

    renderPage();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('JN-ABCDEFGH')).toBeInTheDocument();
    expect(fetchReports).toHaveBeenCalledTimes(2);
  });

  it('renders reports with readable labels and no reporter identity', async () => {
    fetchReports.mockResolvedValue({ data: { data: sampleReports } });
    renderPage();

    const list = await screen.findByRole('list', { name: 'Incoming reports' });
    expect(within(list).getByText('JN-ABCDEFGH')).toBeInTheDocument();
    expect(within(list).getByText('Harassment')).toBeInTheDocument();
    expect(within(list).getByText('Land dispute')).toBeInTheDocument();
    expect(within(list).getByText('Under review')).toBeInTheDocument();
    expect(screen.queryByText(/reporter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it('refetches when the case type filter changes', async () => {
    const user = userEvent.setup();
    fetchReports.mockResolvedValue({ data: { data: sampleReports } });
    renderPage();

    await screen.findByText('JN-ABCDEFGH');
    await user.selectOptions(screen.getByLabelText('Filter by case type'), 'harassment');

    await waitFor(() => {
      expect(fetchReports).toHaveBeenLastCalledWith({ caseType: 'harassment' });
    });
  });

  it('expands a row to show the full description', async () => {
    const user = userEvent.setup();
    fetchReports.mockResolvedValue({ data: { data: [sampleReports[1]] } });
    renderPage();

    const row = await screen.findByRole('button', { name: /JN-HIJKLMNO/i });
    expect(screen.getByText(/A neighbour fenced off/)).toBeInTheDocument();
    expect(screen.queryByText('Full description')).not.toBeInTheDocument();

    await user.click(row);

    expect(screen.getByText('Full description')).toBeInTheDocument();
    const body = screen.getByText(/blocked our family from reaching the main road/);
    expect(body).toBeInTheDocument();
  });
});
