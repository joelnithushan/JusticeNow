/**
 * Component tests — StaffReportDetail (JNOW-13 staff case view).
 *
 * The API and auth context are mocked, so no network or Supabase session is
 * needed. We assert the safety-critical UI behaviour:
 *   - the current status is pre-selected in the segmented control;
 *   - notes show a worded marker for reporter-visible vs internal;
 *   - the "visible to reporter" checkbox defaults to OFF;
 *   - changing status / adding a note calls the API correctly.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StaffReportDetail from '../pages/StaffReportDetail';
import {
  fetchReport,
  fetchCaseNotes,
  updateReportStatus,
  addCaseNote,
} from '../api/client';

vi.mock('../api/client', () => ({
  fetchReport: vi.fn(),
  fetchCaseNotes: vi.fn(),
  updateReportStatus: vi.fn(),
  addCaseNote: vi.fn(),
}));

// Signed-in staff session with a token; user for StaffHeader.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 'tok' },
    user: { email: 'officer@example.org' },
    logout: vi.fn(),
  }),
}));

const CASE_ID = '11111111-1111-4111-8111-111111111111';

const caseData = {
  id: CASE_ID,
  reference_code: 'JN-ABCDEFGH',
  case_type: 'harassment',
  district: 'Colombo',
  description: 'Something happened.',
  status: 'received',
  created_at: '2026-08-01T10:00:00Z',
};

const notes = [
  {
    id: 'n2',
    note: 'Visible update',
    is_reporter_visible: true,
    created_at: '2026-08-02T10:00:00Z',
    author_name: 'Officer Perera',
  },
  {
    id: 'n1',
    note: 'Internal aside',
    is_reporter_visible: false,
    created_at: '2026-08-01T11:00:00Z',
    author_name: 'Officer Perera',
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/staff/reports/${CASE_ID}`]}>
      <Routes>
        <Route path="/staff/reports/:id" element={<StaffReportDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchReport.mockResolvedValue({ data: { data: caseData } });
  fetchCaseNotes.mockResolvedValue({ data: { data: notes } });
  updateReportStatus.mockResolvedValue({
    data: { data: { id: CASE_ID, status: 'closed', updated_at: 'x' } },
  });
  addCaseNote.mockResolvedValue({ data: { data: { id: 'n3' } } });
});

describe('StaffReportDetail', () => {
  it('pre-selects the current status in the segmented control', async () => {
    renderPage();
    // "Received" is the current status → aria-checked true; others false.
    const received = await screen.findByRole('radio', { name: 'Received' });
    expect(received).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Closed' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('shows a worded marker for reporter-visible vs internal notes', async () => {
    renderPage();
    expect(await screen.findByText('Visible to reporter')).toBeInTheDocument();
    expect(screen.getByText('Internal only')).toBeInTheDocument();
    expect(screen.getByText('Visible update')).toBeInTheDocument();
    expect(screen.getByText('Internal aside')).toBeInTheDocument();
  });

  it('defaults the "visible to reporter" checkbox to OFF', async () => {
    renderPage();
    const checkbox = await screen.findByRole('checkbox', {
      name: /show this note to the reporter/i,
    });
    expect(checkbox).not.toBeChecked();
  });

  it('changes status via the API when another option is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('radio', { name: 'Received' });

    await user.click(screen.getByRole('radio', { name: 'Closed' }));

    expect(updateReportStatus).toHaveBeenCalledWith(CASE_ID, 'closed', 'tok');
  });

  it('adds an internal note by default when the box is left unchecked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('radio', { name: 'Received' });

    await user.type(screen.getByLabelText(/add a note/i), 'A fresh internal note');
    await user.click(screen.getByRole('button', { name: /^add note$/i }));

    await waitFor(() => {
      expect(addCaseNote).toHaveBeenCalledWith(
        CASE_ID,
        { note: 'A fresh internal note', isReporterVisible: false },
        'tok',
      );
    });
  });
});
