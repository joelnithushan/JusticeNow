/**
 * Integration tests — JNOW-35 evidence signed-URL endpoint (Supertest).
 *
 * Same fetch-stub approach as the other integration suites: no real database,
 * no real Supabase Storage. We fake Supabase Auth (token check), the
 * case_reports lookup, and the Storage "create signed URL" call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';

const CASE_WITH_EVIDENCE = '11111111-1111-4111-8111-111111111111';
const CASE_NO_EVIDENCE = '22222222-2222-4222-8222-222222222222';
const GOOD_TOKEN = 'good-token';

function headerValue(options, name) {
  const h = options.headers || {};
  if (typeof h.get === 'function') return h.get(name);
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';

  if (target.includes('/auth/v1/user')) {
    const auth = headerValue(options, 'Authorization') || '';
    return auth.includes(GOOD_TOKEN)
      ? json({ id: 'auth-user-1', email: 'officer@example.org' })
      : json({ msg: 'invalid token' }, 401);
  }

  // case_reports lookup: return an evidence_path only for the "with evidence" id.
  if (target.includes('/rest/v1/case_reports')) {
    if (target.includes(CASE_NO_EVIDENCE)) {
      return json([{ id: CASE_NO_EVIDENCE, evidence_path: null }]);
    }
    return json([{ id: CASE_WITH_EVIDENCE, evidence_path: 'abcd1234efgh5678.pdf' }]);
  }

  // Supabase Storage: create signed URL.
  if (method === 'POST' && target.includes('/storage/v1/object/sign/evidence')) {
    return json({
      signedURL: '/object/sign/evidence/abcd1234efgh5678.pdf?token=SIGNED',
    });
  }

  return json([]);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');
const auth = (req) => req.set('Authorization', `Bearer ${GOOD_TOKEN}`);

beforeEach(() => fetchMock.mockClear());

describe('GET /api/reports/:id/evidence (JNOW-35)', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get(`/api/reports/${CASE_WITH_EVIDENCE}/evidence`);
    expect(res.status).toBe(401);
  });

  it('returns a signed URL (not a public link) for a case with evidence', async () => {
    const res = await auth(
      request(app).get(`/api/reports/${CASE_WITH_EVIDENCE}/evidence`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.url).toContain('/object/sign/evidence/');
    expect(res.body.data.url).toContain('token=');
    expect(res.body.data.expires_in).toBeGreaterThan(0);
  });

  it('returns 404 when the case has no evidence attached', async () => {
    const res = await auth(
      request(app).get(`/api/reports/${CASE_NO_EVIDENCE}/evidence`),
    );
    expect(res.status).toBe(404);
  });
});
