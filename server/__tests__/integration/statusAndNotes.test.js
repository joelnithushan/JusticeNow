/**
 * Integration tests — JNOW-13 staff case management (Supertest).
 *
 * Same approach as reports.test.js: stub the global fetch that the Supabase
 * client uses, so no real database or network is needed. We exercise the real
 * Express app, routes, requireStaffAuth middleware, controller and validation.
 *
 * The stub also fakes Supabase Auth's /auth/v1/user endpoint so we can prove
 * the endpoints reject anonymous callers (401) and accept a valid staff token.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const GOOD_TOKEN = 'good-token';

// Capture what the app tries to write, so tests can assert on it.
let lastNoteInsert = null;
let lastStatusPatch = null;

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

  // ---- Supabase Auth: validate the bearer token ----
  if (target.includes('/auth/v1/user')) {
    const auth = headerValue(options, 'Authorization') || '';
    if (auth.includes(GOOD_TOKEN)) {
      return json({ id: 'auth-user-1', email: 'officer@example.org' });
    }
    return json({ msg: 'invalid token' }, 401);
  }

  // ---- staff_users lookup (author resolution by email) ----
  if (target.includes('/rest/v1/staff_users')) {
    return json([{ id: 'staff-1', name: 'Officer Perera' }]);
  }

  // ---- case_reports status update (PATCH) ----
  if (method === 'PATCH' && target.includes('/rest/v1/case_reports')) {
    lastStatusPatch = options.body ? JSON.parse(options.body) : null;
    return json([
      {
        id: CASE_ID,
        status: lastStatusPatch.status,
        updated_at: '2026-08-25T00:00:00Z',
      },
    ]);
  }

  // ---- case_notes insert (POST) ----
  if (method === 'POST' && target.includes('/rest/v1/case_notes')) {
    lastNoteInsert = options.body ? JSON.parse(options.body) : null;
    const row = Array.isArray(lastNoteInsert) ? lastNoteInsert[0] : lastNoteInsert;
    return json([{ id: 'note-1', created_at: '2026-08-25T00:00:00Z', ...row }], 201);
  }

  // ---- case_notes list (GET) ----
  if (method === 'GET' && target.includes('/rest/v1/case_notes')) {
    return json([
      {
        id: 'n2',
        note: 'Visible update',
        is_reporter_visible: true,
        created_at: '2026-08-25T02:00:00Z',
        author: { name: 'Officer Perera' },
      },
      {
        id: 'n1',
        note: 'Internal aside',
        is_reporter_visible: false,
        created_at: '2026-08-25T01:00:00Z',
        author: { name: 'Officer Perera' },
      },
    ]);
  }

  return json([]);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

const auth = (req) => req.set('Authorization', `Bearer ${GOOD_TOKEN}`);

beforeEach(() => {
  lastNoteInsert = null;
  lastStatusPatch = null;
  fetchMock.mockClear();
});

describe('Auth gating (requireStaffAuth)', () => {
  it('rejects an unauthenticated status change with 401', async () => {
    const res = await request(app)
      .patch(`/api/reports/${CASE_ID}/status`)
      .send({ status: 'under_review' });
    expect(res.status).toBe(401);
    expect(lastStatusPatch).toBeNull();
  });

  it('rejects unauthenticated note add and note list with 401', async () => {
    const add = await request(app)
      .post(`/api/reports/${CASE_ID}/notes`)
      .send({ note: 'x' });
    const list = await request(app).get(`/api/reports/${CASE_ID}/notes`);
    expect(add.status).toBe(401);
    expect(list.status).toBe(401);
    expect(lastNoteInsert).toBeNull();
  });

  it('rejects a bad token with 401', async () => {
    const res = await auth(request(app).patch(`/api/reports/${CASE_ID}/status`))
      .set('Authorization', 'Bearer nope')
      .send({ status: 'closed' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/reports/:id/status', () => {
  it('changes the status to a value in the allowed set', async () => {
    const res = await auth(request(app).patch(`/api/reports/${CASE_ID}/status`)).send({
      status: 'under_review',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('under_review');
    expect(lastStatusPatch.status).toBe('under_review');
  });

  it('rejects a status outside the allowed set with 400', async () => {
    const res = await auth(request(app).patch(`/api/reports/${CASE_ID}/status`)).send({
      status: 'archived',
    });
    expect(res.status).toBe(400);
    expect(lastStatusPatch).toBeNull();
  });
});

describe('POST /api/reports/:id/notes', () => {
  it('stores an internal note by default (is_reporter_visible false)', async () => {
    const res = await auth(request(app).post(`/api/reports/${CASE_ID}/notes`)).send({
      note: 'Internal aside',
    });
    expect(res.status).toBe(201);
    const row = Array.isArray(lastNoteInsert) ? lastNoteInsert[0] : lastNoteInsert;
    expect(row.is_reporter_visible).toBe(false);
    expect(row.case_id).toBe(CASE_ID);
    // Author was attributed via the staff_users email lookup.
    expect(row.author_id).toBe('staff-1');
  });

  it('stores a reporter-visible note only when explicitly true', async () => {
    const res = await auth(request(app).post(`/api/reports/${CASE_ID}/notes`)).send({
      note: 'Visible update',
      is_reporter_visible: true,
    });
    expect(res.status).toBe(201);
    const row = Array.isArray(lastNoteInsert) ? lastNoteInsert[0] : lastNoteInsert;
    expect(row.is_reporter_visible).toBe(true);
  });

  it('rejects an empty note with 400', async () => {
    const res = await auth(request(app).post(`/api/reports/${CASE_ID}/notes`)).send({
      note: '   ',
    });
    expect(res.status).toBe(400);
    expect(lastNoteInsert).toBeNull();
  });
});

describe('GET /api/reports/:id/notes', () => {
  it('returns notes with author name, newest first (includes internal)', async () => {
    const res = await auth(request(app).get(`/api/reports/${CASE_ID}/notes`));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].author_name).toBe('Officer Perera');
    // Staff view includes BOTH visible and internal notes.
    const visibilities = res.body.data.map((n) => n.is_reporter_visible);
    expect(visibilities).toContain(true);
    expect(visibilities).toContain(false);
  });
});
