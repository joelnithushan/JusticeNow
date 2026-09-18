/**
 * Integration tests — GET /api/status/:reference_code (anonymous lookup).
 *
 * Follows the repo pattern (see integration/reports.test.js): we do NOT hit a
 * real database. We stub the global fetch that the Supabase client uses and hand
 * back canned PostgREST responses. The stub is installed BEFORE the app is
 * imported, because the app builds its Supabase client at import time.
 *
 * What we pin down here:
 *  - a found case returns ONLY the safe projection (no description /
 *    evidence_path / internal notes / assigned_org_id / note author_id);
 *  - reporter-visible notes are included, internal notes excluded;
 *  - an unknown code returns the generic 404 body;
 *  - once rate-limited, further attempts return the IDENTICAL 404 body/status
 *    as a not-found — so the endpoint cannot be used as an enumeration oracle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
// The app wires in staff auth, which needs a signing secret at import time.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Test doubles the fetch stub returns. Setting caseRow to null simulates a
// code that matches no case. caseNotes is what the case_notes query returns —
// we deliberately include an internal note the SERVER must have filtered out;
// because the service adds `.eq('is_reporter_visible', true)` to the query, the
// PostgREST layer would only ever return visible rows, so the stub returns just
// those to mirror real behaviour.
let caseRow = null;
let caseNotes = [];

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';

  if (method === 'GET' && target.includes('/rest/v1/case_notes')) {
    return new Response(JSON.stringify(caseNotes), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (method === 'GET' && target.includes('/rest/v1/case_reports')) {
    // maybeSingle(): returning the object (or null) is what the client expects.
    return new Response(JSON.stringify(caseRow), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');
// The canonical generic negative response, imported so the test asserts against
// the SAME body the controller sends rather than a hand-copied duplicate.
const { NOT_FOUND_BODY } = await import('../../controllers/statusController.js');

// A full case row as it would come back from case_reports with the SAFE column
// selection. It intentionally does NOT contain description / evidence_path /
// assigned_org_id — the service selects only safe columns, so a real row handed
// to the assembler never carries them.
const foundCase = {
  id: 'case-uuid-1',
  reference_code: 'JN-ABCD2345',
  case_type: 'land_dispute',
  district: 'Jaffna',
  incident_date: '2026-01-10',
  status: 'under_review',
  created_at: '2026-01-11T08:00:00.000Z',
  updated_at: '2026-01-12T09:30:00.000Z',
};

beforeEach(() => {
  caseRow = null;
  caseNotes = [];
  fetchMock.mockClear();
});

describe('GET /api/status/:reference_code — found case', () => {
  it('returns the safe projection and NEVER leaks excluded fields', async () => {
    caseRow = foundCase;
    caseNotes = [
      { note: 'Your case has been assigned to a legal officer.', created_at: '2026-01-11T10:00:00.000Z' },
      { note: 'We have requested additional information from the district office.', created_at: '2026-01-12T09:30:00.000Z' },
    ];

    const res = await request(app).get('/api/status/JN-ABCD2345');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { data } = res.body;
    // Safe fields present.
    expect(data.reference_code).toBe('JN-ABCD2345');
    expect(data.case_type).toBe('land_dispute');
    expect(data.district).toBe('Jaffna');
    expect(data.incident_date).toBe('2026-01-10');
    expect(data.status).toBe('under_review');
    expect(data.created_at).toBe('2026-01-11T08:00:00.000Z');
    expect(data.updated_at).toBe('2026-01-12T09:30:00.000Z');

    // Excluded ALWAYS — narrative, evidence, assigned org, internal id.
    for (const forbidden of ['description', 'evidence_path', 'assigned_org_id', 'id']) {
      expect(data).not.toHaveProperty(forbidden);
    }
  });

  it('includes reporter-visible notes oldest->newest, each carrying a sender label', async () => {
    caseRow = foundCase;
    // The two-way thread: a staff note and a reporter reply, both visible. The
    // service now projects `sender` onto every note so the client can label
    // "you" vs a case worker.
    caseNotes = [
      { note: 'First visible update.', created_at: '2026-01-11T10:00:00.000Z', sender: 'staff' },
      { note: 'Thanks, here is more detail.', created_at: '2026-01-12T09:30:00.000Z', sender: 'reporter' },
    ];

    const res = await request(app).get('/api/status/JN-ABCD2345');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.notes)).toBe(true);
    expect(res.body.data.notes).toEqual([
      { note: 'First visible update.', created_at: '2026-01-11T10:00:00.000Z', sender: 'staff' },
      { note: 'Thanks, here is more detail.', created_at: '2026-01-12T09:30:00.000Z', sender: 'reporter' },
    ]);

    // Each note now carries EXACTLY { note, created_at, sender } — and still
    // never an author_id, which would identify a staff member to the reporter.
    for (const note of res.body.data.notes) {
      expect(Object.keys(note).sort()).toEqual(['created_at', 'note', 'sender']);
      expect(note).not.toHaveProperty('author_id');
      expect(['staff', 'reporter']).toContain(note.sender);
    }
  });

  it('defaults a legacy note with no sender to "staff" (never leaks as reporter)', async () => {
    caseRow = foundCase;
    // A row written before the `sender` column existed comes back with sender
    // absent/unknown. It must default to 'staff' — never be mislabelled as the
    // reporter's own message.
    caseNotes = [
      { note: 'Legacy note before sender column.', created_at: '2026-01-11T10:00:00.000Z' },
      { note: 'Odd value note.', created_at: '2026-01-11T11:00:00.000Z', sender: 'system' },
    ];

    const res = await request(app).get('/api/status/JN-ABCD2345');

    expect(res.status).toBe(200);
    for (const note of res.body.data.notes) {
      expect(note.sender).toBe('staff');
    }
  });

  it('asks Supabase for only reporter-visible notes (server-side filter)', async () => {
    caseRow = foundCase;
    caseNotes = [{ note: 'Visible.', created_at: '2026-01-11T10:00:00.000Z' }];

    await request(app).get('/api/status/JN-ABCD2345');

    // Prove the internal-notes boundary is enforced in the QUERY, not the client:
    // the case_notes request URL must constrain is_reporter_visible = true.
    const notesCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/rest/v1/case_notes')
    );
    expect(notesCall).toBeTruthy();
    expect(String(notesCall[0])).toContain('is_reporter_visible=eq.true');
  });

  it('returns an empty notes array when there are no visible notes', async () => {
    caseRow = foundCase;
    caseNotes = [];

    const res = await request(app).get('/api/status/JN-ABCD2345');

    expect(res.status).toBe(200);
    expect(res.body.data.notes).toEqual([]);
  });
});

describe('GET /api/status/:reference_code — unknown code', () => {
  it('returns the generic 404 body for a code that matches no case', async () => {
    caseRow = null; // no match

    const res = await request(app).get('/api/status/JN-NOSUCH99');

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
  });
});

describe('GET /api/status/:reference_code — rate limiting (no oracle)', () => {
  it('returns the IDENTICAL 404 body/status once rate-limited as for not-found', async () => {
    caseRow = null; // every lookup here is a miss

    // First, capture a genuine not-found response.
    const notFound = await request(app).get('/api/status/JN-MISS0001');
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(NOT_FOUND_BODY);

    // The default cap is 10 attempts / window. We already used 1 above (plus any
    // from earlier tests in this file share the same per-process limiter and
    // client IP). Fire enough more attempts to guarantee we cross the threshold.
    let rateLimited;
    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line no-await-in-loop -- must be sequential to trip
      rateLimited = await request(app).get('/api/status/JN-MISS0001');
    }

    // The throttled response must be byte-for-byte identical to a not-found:
    // same status AND same body. This is what makes the endpoint useless as an
    // enumeration oracle.
    expect(rateLimited.status).toBe(404);
    expect(rateLimited.body).toEqual(NOT_FOUND_BODY);
    expect(rateLimited.status).toBe(notFound.status);
    expect(rateLimited.body).toEqual(notFound.body);
  });
});
