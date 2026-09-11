/**
 * Integration tests — /api/reports (HTTP layer via Supertest).
 *
 * We do NOT hit a real database. Instead we stub the global fetch that the
 * Supabase client uses, and hand back a canned REST response. This keeps the
 * tests fast, deterministic, and safe to run in CI with no credentials, while
 * still exercising the real Express app, routes, controller and validation.
 *
 * The stub must be installed before the app is imported, because the app builds
 * its Supabase client at import time and captures fetch then.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// config/supabase.js requires these to be present; the values are never used
// for a real call because fetch is stubbed.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
// The app now wires in staff auth (services/auth.js), which requires a signing
// secret at import time. A throwaway value is fine — no real tokens are minted.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Capture the row the app tries to insert, and fake a successful PostgREST
// response so no real network call happens.
let lastInsertBody = null;

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  if (options.method === 'POST' && target.includes('/rest/v1/case_reports')) {
    lastInsertBody = options.body ? JSON.parse(options.body) : null;
    return new Response('[]', {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Default: an empty, successful response for any other call (e.g. list).
  return new Response('[]', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

vi.stubGlobal('fetch', fetchMock);

// The Supabase client constructs a realtime client that needs a global
// WebSocket. Node < 21 has none, and we never use realtime here, so provide a
// harmless stub. (Runtime uses Node 22 — see .nvmrc — which has WebSocket.)
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

// Import the app AFTER the stubs and env are in place.
const { default: app } = await import('../../app.js');

const validReport = {
  case_type: 'land_dispute',
  district: 'Jaffna',
  description: 'A neighbour fenced off part of the access road.',
};

beforeEach(() => {
  lastInsertBody = null;
  fetchMock.mockClear();
});

describe('POST /api/reports', () => {
  it('accepts a valid report and returns a reference code', async () => {
    const res = await request(app).post('/api/reports').send(validReport);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reference_code).toMatch(/^JN-/);

    // ANONYMITY: assert the row we tried to insert carries no identity fields.
    const inserted = Array.isArray(lastInsertBody) ? lastInsertBody[0] : lastInsertBody;
    expect(inserted).toBeTruthy();
    for (const forbidden of ['user_id', 'reporter_id', 'email', 'phone', 'name', 'ip']) {
      expect(inserted).not.toHaveProperty(forbidden);
    }
  });

  it('rejects missing required fields with a 400 and a helpful message', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ description: '' }); // no case_type, no district, empty description

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/case_type/);
    // Nothing should have been written when validation fails.
    expect(lastInsertBody).toBeNull();
  });
});

/**
 * PENDING — these pin down behaviour that belongs to stories not yet built
 * (staff authentication, and the rate-limited anonymous status lookup). They
 * are written as executable specification: `it.todo` keeps the suite green
 * while making the intended contract impossible to forget. Turn each into a
 * real test in the PR that implements the feature.
 */
describe('GET /api/reports (staff only)', () => {
  // A JWT signed with the same secret services/auth.js verifies against. We mint
  // it here (rather than logging in) so the test needs no DB — verifyToken only
  // checks the signature, not that the staff row still exists.
  const staffToken = jwt.sign(
    { sub: 'staff-1', role: 'officer', org: 'org-1' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );

  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/reports');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a bogus/tampered token with 401', async () => {
    const res = await request(app)
      .get('/api/reports')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('allows a caller with a valid staff token (200)', async () => {
    const res = await request(app)
      .get('/api/reports')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The fetch stub returns [] for the list query, so data is an empty array.
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// The anonymous status lookup is now implemented and fully covered in
// __tests__/integration/status.test.js (safe projection, internal-note
// stripping, rate limiting with an identical not-found/rate-limited response).
