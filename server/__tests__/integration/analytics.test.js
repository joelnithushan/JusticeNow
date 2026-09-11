/**
 * Integration tests — /api/analytics (aggregate dashboard figures).
 *
 * Follows the repo fetch-stub pattern (see reports.test.js / caseDetail.test.js):
 * we do NOT hit a real database. We stub the global fetch the Supabase client
 * uses and return canned PostgREST rows; the stub is installed BEFORE the app is
 * imported, because the app builds its Supabase client at import time. The
 * guarded route is exercised with a REAL JWT signed with process.env.JWT_SECRET.
 *
 * What we pin down here:
 *  - 401 without a staff token; 200 with one (analytics is available to ALL
 *    staff roles — requireStaff only, no admin narrowing);
 *  - by_status / by_case_type counts are correct AND include zero buckets;
 *  - total matches the row count;
 *  - by_district includes only non-zero districts;
 *  - recent_by_month has exactly 6 entries, oldest→newest, and buckets rows by
 *    the created_at values we control (this-month and last-month), while a very
 *    old row falls outside the window;
 *  - the response is the aggregate shape ONLY — no rows, ids, reference codes,
 *    narrative, or reporter identity leak.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import constants from '../../constants.js';

const { CASE_TYPES } = constants;
// Seed every known category to zero, then set the fixture counts — keeps this
// assertion in sync with the shared CASE_TYPES list rather than hard-coding it.
const zeroedCaseTypes = () => Object.fromEntries(CASE_TYPES.map((c) => [c, 0]));

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// The case_reports rows the stub returns for the analytics select, reset per-test.
let caseRows = [];
// Capture the querystring the app asked for, so we can assert the select only
// pulls the four aggregate columns (never description/evidence_path).
let lastCaseReportsUrl = null;

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  if (target.includes('/rest/v1/case_reports')) {
    lastCaseReportsUrl = target;
    return json(caseRows);
  }
  return json([], 200);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

const officerToken = jwt.sign(
  { sub: 'staff-officer', role: 'officer', org: 'org-1' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Helpers to build created_at values relative to "now", so month bucketing is
// asserted against the same clock the service reads (new Date() is allowed in
// server code). We anchor at day 15 UTC to stay safely inside a month.
function isoMonthsAgo(monthsAgo) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 15));
  return d.toISOString();
}
function monthKeyMonthsAgo(monthsAgo) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 15));
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

beforeEach(() => {
  caseRows = [];
  lastCaseReportsUrl = null;
  fetchMock.mockClear();
});

describe('GET /api/analytics — auth', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/analytics');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('allows any staff role with a valid token (200)', async () => {
    caseRows = [];
    const res = await request(app).get('/api/analytics').set(bearer(officerToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/analytics — aggregation', () => {
  it('counts by_status and by_case_type correctly AND includes zero buckets', async () => {
    caseRows = [
      { status: 'received', case_type: 'harassment', district: 'Colombo', created_at: isoMonthsAgo(0) },
      { status: 'received', case_type: 'land_dispute', district: 'Jaffna', created_at: isoMonthsAgo(0) },
      { status: 'under_review', case_type: 'harassment', district: 'Colombo', created_at: isoMonthsAgo(1) },
    ];

    const res = await request(app).get('/api/analytics').set(bearer(officerToken));
    expect(res.status).toBe(200);
    const { data } = res.body;

    // total matches the row count.
    expect(data.total).toBe(3);

    // by_status: correct counts, and every known status present (incl. zeros).
    expect(data.by_status).toEqual({
      received: 2,
      under_review: 1,
      referred: 0,
      closed: 0,
    });

    // by_case_type: correct counts, and every known case type present (zeros).
    expect(data.by_case_type).toEqual({ ...zeroedCaseTypes(), harassment: 2, land_dispute: 1 });

    // by_district: ONLY non-zero districts are included (compact map).
    expect(data.by_district).toEqual({ Colombo: 2, Jaffna: 1 });
    expect(Object.keys(data.by_district)).not.toContain('Kandy');
  });

  it('handles zero cases: all-zero buckets and total 0', async () => {
    caseRows = [];
    const res = await request(app).get('/api/analytics').set(bearer(officerToken));
    const { data } = res.body;

    expect(data.total).toBe(0);
    expect(data.by_status).toEqual({
      received: 0,
      under_review: 0,
      referred: 0,
      closed: 0,
    });
    // Compact district map is empty when nothing has cases.
    expect(data.by_district).toEqual({});
    // recent_by_month still spans 6 months, all at zero.
    expect(data.recent_by_month).toHaveLength(6);
    expect(data.recent_by_month.every((m) => m.count === 0)).toBe(true);
  });

  it('builds recent_by_month with 6 entries oldest→newest and buckets rows by month', async () => {
    caseRows = [
      { status: 'received', case_type: 'other', district: 'Galle', created_at: isoMonthsAgo(0) },
      { status: 'received', case_type: 'other', district: 'Galle', created_at: isoMonthsAgo(0) },
      { status: 'closed', case_type: 'other', district: 'Galle', created_at: isoMonthsAgo(1) },
      // A very old row: counts in total but falls OUTSIDE the 6-month window.
      { status: 'closed', case_type: 'other', district: 'Galle', created_at: isoMonthsAgo(11) },
    ];

    const res = await request(app).get('/api/analytics').set(bearer(officerToken));
    const { data } = res.body;

    // Exactly 6 entries.
    expect(data.recent_by_month).toHaveLength(6);

    // Oldest → newest: the last entry is the current month, and the keys are in
    // ascending order.
    const keys = data.recent_by_month.map((m) => m.month);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(keys[5]).toBe(monthKeyMonthsAgo(0));
    expect(keys[4]).toBe(monthKeyMonthsAgo(1));

    // Current month has 2, previous has 1.
    const current = data.recent_by_month.find((m) => m.month === monthKeyMonthsAgo(0));
    const previous = data.recent_by_month.find((m) => m.month === monthKeyMonthsAgo(1));
    expect(current.count).toBe(2);
    expect(previous.count).toBe(1);

    // The 11-months-ago row is outside the window: no month bucket claims it, but
    // total still counts all 4 rows.
    const inWindow = data.recent_by_month.reduce((sum, m) => sum + m.count, 0);
    expect(inWindow).toBe(3);
    expect(data.total).toBe(4);
  });

  it('returns ONLY the aggregate shape — no rows/ids/narrative/reporter identity', async () => {
    caseRows = [
      { status: 'received', case_type: 'harassment', district: 'Colombo', created_at: isoMonthsAgo(0) },
    ];

    const res = await request(app).get('/api/analytics').set(bearer(officerToken));
    const { data } = res.body;

    // The keys are exactly the documented aggregate keys — nothing else.
    expect(Object.keys(data).sort()).toEqual(
      ['by_case_type', 'by_district', 'by_status', 'recent_by_month', 'total'].sort(),
    );

    // Defensive: no case content or identity anywhere in the serialized body.
    const serialized = JSON.stringify(res.body);
    for (const forbidden of [
      'description',
      'evidence_path',
      'reference_code',
      'user_id',
      'email',
      'phone',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // The select must pull ONLY the four aggregate columns — never the narrative
    // or evidence path. PostgREST puts the projection in the `select` query param.
    const decoded = decodeURIComponent(lastCaseReportsUrl || '');
    expect(decoded).toContain('status');
    expect(decoded).toContain('case_type');
    expect(decoded).toContain('district');
    expect(decoded).toContain('created_at');
    expect(decoded).not.toContain('description');
    expect(decoded).not.toContain('evidence_path');
  });
});
