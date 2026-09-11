/**
 * Integration tests — POST /api/staff/login rate limiting (login hardening).
 *
 * Follows the repo fetch-stub pattern (see reports.test.js / staffAdmin.test.js):
 * we do NOT hit a real database. We stub the global fetch the Supabase client
 * uses and hand back canned PostgREST responses; the stub is installed BEFORE
 * the app is imported, because the app builds its Supabase client at import time.
 *
 * What we pin down here:
 *  - /login is throttled per IP: once the default cap (10 attempts / window) is
 *    crossed, further attempts return 429 with the documented message BEFORE any
 *    credential work runs — the login controller checks req.isRateLimited first.
 *  - The 429 path does not perform a staff lookup (no wasted DB/bcrypt work under
 *    a brute-force flood).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Count how many staff_users lookups the login flow actually issues, so we can
// prove the 429 path short-circuits BEFORE any credential work.
let staffLookupCount = 0;

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';

  // audit_log inserts (best-effort staff_login event) — swallow.
  if (method === 'POST' && target.includes('/rest/v1/audit_log')) {
    return new Response('[]', {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }

  // staff_users lookup during authenticateStaff — return null (no such user) so
  // every login here is a genuine failure, but count the calls.
  if (target.includes('/rest/v1/staff_users')) {
    staffLookupCount += 1;
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('[]', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

const creds = { email: 'nobody@justicenow.local', password: 'whatever-8chars' };

beforeEach(() => {
  staffLookupCount = 0;
  fetchMock.mockClear();
});

describe('POST /api/staff/login — rate limiting', () => {
  it('returns 429 with the documented message once the per-IP threshold is exceeded', async () => {
    // The default cap is 10 attempts / window (DEFAULT_MAX_ATTEMPTS). The limiter
    // flags once count EXCEEDS the cap, so attempts 1..10 fall through to the
    // controller (each a genuine 401 for the unknown email) and attempt 11+ is
    // throttled. Fire enough attempts to guarantee we cross the threshold. The
    // limiter is per-process and keyed by IP, so all requests from this test
    // client share one counter.
    let last;
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop -- must be sequential to trip
      last = await request(app).post('/api/staff/login').send(creds);
    }

    // The final attempt is over the cap: an explicit 429 with the exact message.
    expect(last.status).toBe(429);
    expect(last.body.success).toBe(false);
    expect(last.body.message).toBe('Too many attempts. Please wait and try again.');
  });

  it('a throttled request does not perform a staff lookup (short-circuits before any credential work)', async () => {
    // Exhaust the window first.
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop -- must be sequential to trip
      await request(app).post('/api/staff/login').send(creds);
    }

    // Now the counter is over the cap. Reset the lookup counter and fire ONE more
    // request: it must be a 429 that never reaches the service (no staff_users
    // read), proving the controller checks req.isRateLimited before any DB work.
    staffLookupCount = 0;
    const res = await request(app).post('/api/staff/login').send(creds);

    expect(res.status).toBe(429);
    expect(staffLookupCount).toBe(0);
  });
});
