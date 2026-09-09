/**
 * Integration tests — staff case detail auth pattern (fetch stub + real JWT).
 *
 * This file is the template other org-scoped suites copy from (see
 * referCase.test.js). Pattern:
 *   1. Set JWT_SECRET BEFORE importing the app.
 *   2. Stub global fetch so Supabase REST never hits a real network.
 *   3. Sign staff JWTs that carry role + organisation_id claims.
 *   4. Assert behaviour against the real Express app via Supertest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { signStaffToken } from '../../utils/staffJwt.js';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const JWT_SECRET = process.env.JWT_SECRET;

const CASE_ROW = {
  id: CASE_ID,
  reference_code: 'JN-TESTCODE1',
  case_type: 'harassment',
  incident_date: '2026-01-10',
  district: 'Colombo',
  description: 'A short anonymous narrative.',
  status: 'received',
  evidence_path: null,
  assigned_org_id: 'org-1',
  created_at: '2026-03-01T10:00:00.000Z',
  updated_at: '2026-03-01T10:00:00.000Z',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const fetchMock = vi.fn(async (url) => {
  const target = String(url);

  if (target.includes('/rest/v1/case_reports')) {
    if (target.includes(CASE_ID)) return json([CASE_ROW]);
    return json([]);
  }

  // Auth fallback path should not be needed when a valid JWT is presented,
  // but keep a safe default so stray calls do not throw.
  if (target.includes('/auth/v1/user')) {
    return json({ msg: 'invalid token' }, 401);
  }

  return json([]);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

/** Sign a staff JWT with the role + org claims org-scoping depends on. */
function staffAuth(req, claims) {
  const token = signStaffToken(
    {
      sub: claims.sub || 'staff-1',
      email: claims.email || 'officer@example.org',
      role: claims.role,
      organisation_id: claims.organisation_id,
    },
    JWT_SECRET,
  );
  return req.set('Authorization', `Bearer ${token}`);
}

beforeEach(() => {
  fetchMock.mockClear();
});

describe('GET /api/reports/:id (JWT staff pattern)', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get(`/api/reports/${CASE_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns the case for a staff JWT that carries role + org claims', async () => {
    const res = await staffAuth(request(app).get(`/api/reports/${CASE_ID}`), {
      role: 'officer',
      organisation_id: 'org-1',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(CASE_ID);
    // Anonymity: no reporter identity fields on the payload.
    expect(res.body.data).not.toHaveProperty('email');
    expect(res.body.data).not.toHaveProperty('user_id');
  });
});

export { staffAuth, json, CASE_ID, JWT_SECRET };
