/**
 * Integration tests — GET /api/transparency PUBLIC dashboard.
 *
 * Same fetch-stub pattern as the other integration tests (no real DB). This is a
 * PUBLIC endpoint (no token). We pin:
 *   - the response is anonymised aggregate COUNTS only (no ids/reference codes/
 *     narratives — the service only ever selects status/case_type/district/
 *     created_at, and there is no reporter identity to leak);
 *   - totals, resolution rate (referred + closed), and the active-org count are
 *     computed correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

let caseRows = [];
let orgCount = 0;

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

  if (target.includes('/rest/v1/case_reports')) {
    return json(caseRows);
  }
  if (target.includes('/rest/v1/organisations')) {
    // head:true count → PostgREST returns the count in content-range.
    return json([], 200, { 'content-range': `0-${Math.max(0, orgCount - 1)}/${orgCount}` });
  }
  return json([]);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');
const { _clearCache } = await import('../../services/transparencyService.js');

beforeEach(() => {
  _clearCache(); // the service caches for 30s; each test starts fresh
  caseRows = [
    { status: 'received', case_type: 'harassment', district: 'Colombo', created_at: '2026-09-01T00:00:00Z' },
    { status: 'received', case_type: 'harassment', district: 'Colombo', created_at: '2026-09-02T00:00:00Z' },
    { status: 'received', case_type: 'harassment', district: 'Jaffna', created_at: '2026-09-03T00:00:00Z' },
    { status: 'referred', case_type: 'land_dispute', district: 'Kandy', created_at: '2026-09-04T00:00:00Z' },
    { status: 'closed', case_type: 'discrimination', district: 'Jaffna', created_at: '2026-09-05T00:00:00Z' },
  ];
  orgCount = 3;
  fetchMock.mockClear();
});

describe('GET /api/transparency — public anonymised aggregates', () => {
  it('returns totals, breakdowns, resolution rate, and org count', async () => {
    const res = await request(app).get('/api/transparency');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const s = res.body.data;

    expect(s.total).toBe(5);
    // resolved = referred (1) + closed (1) = 2 → 40%.
    expect(s.resolved).toBe(2);
    expect(s.resolution_rate).toBeCloseTo(0.4, 5);
    expect(s.organisations).toBe(3);

    expect(s.by_status.received).toBe(3);
    expect(s.by_status.referred).toBe(1);
    expect(s.by_status.closed).toBe(1);
    expect(s.by_case_type.harassment).toBe(3);
    // Only non-zero districts are returned.
    expect(s.by_district).toEqual({ Colombo: 2, Jaffna: 2, Kandy: 1 });
    expect(typeof s.generated_at).toBe('string');
  });

  it('never leaks case content — payload keys are aggregate-only', async () => {
    const res = await request(app).get('/api/transparency');
    const s = res.body.data;
    // The safe, expected shape — nothing like id/reference_code/description.
    expect(Object.keys(s).sort()).toEqual(
      [
        'by_case_type',
        'by_district',
        'by_status',
        'generated_at',
        'organisations',
        'recent_by_month',
        'resolution_rate',
        'resolved',
        'total',
      ].sort(),
    );
  });

  it('handles zero cases without dividing by zero', async () => {
    caseRows = [];
    orgCount = 0;
    const res = await request(app).get('/api/transparency');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.resolution_rate).toBe(0);
  });
});
