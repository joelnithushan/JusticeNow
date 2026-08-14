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

// config/supabase.js requires these to be present; the values are never used
// for a real call because fetch is stubbed.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';

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

// Import the app AFTER the stub and env are in place.
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
  it.todo('rejects an unauthenticated caller with 401 — JNOW: staff auth story');
});

describe('GET /api/status/:reference_code (anonymous lookup)', () => {
  it.todo('returns exactly ONE case selected by reference code');
  it.todo('strips internal (non-reporter-visible) notes server-side');
  it.todo('is rate limited and returns an identical response for not-found vs rate-limited');
});
