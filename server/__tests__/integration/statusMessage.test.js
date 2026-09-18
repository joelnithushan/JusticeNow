/**
 * Integration tests — POST /api/status/message (anonymous reporter reply).
 *
 * Follows the repo pattern (see status.test.js / caseDetail.test.js): we do NOT
 * hit a real database. We stub the global fetch the Supabase client uses and
 * hand back canned PostgREST responses; the stub is installed BEFORE the app is
 * imported, because the app builds its Supabase client at import time.
 *
 * This lives in its OWN file (a sibling of status.test.js) on purpose: the rate
 * limiter is ONE per-process instance shared by GET and POST, and status.test.js
 * deliberately trips it. A fresh file gets a fresh module registry — and thus a
 * fresh, untripped limiter — so the POST cases below start from a clean per-IP
 * budget and the no-oracle rate-limit assertion is not polluted by the GET tests.
 *
 * What we pin down here (mirrors the no-oracle discipline of the lookup):
 *  - a valid code + valid message -> 201 with { note, created_at, sender:'reporter' },
 *    and the case_notes insert carries sender:'reporter', author_id:null,
 *    is_reporter_visible:true (NOTHING identifying is ever written);
 *  - an empty / whitespace / too-long message -> 400 { errors: { message } } with
 *    NO DB insert attempted;
 *  - a well-formed but NONEXISTENT code -> the generic 404 body (same as a miss);
 *  - a rate-limited caller -> the IDENTICAL generic 404 body/status, so the write
 *    endpoint cannot be used as an enumeration oracle either;
 *  - a missing/blank reference_code (with a valid message) -> the generic 404 body;
 *  - a DB error from the service -> a generic 500 that leaks no code/message.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
// The app wires in staff auth, which needs a signing secret at import time.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Test doubles the fetch stub returns, reset per-test.
// caseRow: the case_reports row resolved from the code (null => no such case).
// caseSelectShouldError / notesInsertShouldError: force PostgREST error rows so
// the service throws and the controller maps to a 500.
let caseRow = null;
let caseSelectShouldError = false;
let notesInsertShouldError = false;
// Captures the body of the case_notes insert so we can assert it carries no
// identity and the right sender/visibility.
let insertedNote = null;

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  // --- case_notes ---
  if (target.includes('/rest/v1/case_notes')) {
    if (method === 'POST') {
      insertedNote = options.body ? JSON.parse(options.body) : null;
      if (notesInsertShouldError) {
        // Shape a PostgREST error so supabase-js surfaces `error` and the
        // service throws -> controller returns a generic 500.
        return json({ message: 'insert boom', code: 'XX000' }, 500);
      }
      const row = Array.isArray(insertedNote) ? insertedNote[0] : insertedNote;
      // The insert uses .select('note, created_at, sender').single() → PostgREST
      // returns the single created row.
      return json({
        note: row.note,
        created_at: '2026-02-01T00:00:00.000Z',
        sender: row.sender,
      });
    }
    return json([]);
  }

  // --- case_reports (id lookup by reference_code, .maybeSingle()) ---
  if (target.includes('/rest/v1/case_reports')) {
    if (caseSelectShouldError) {
      return json({ message: 'select boom', code: 'XX000' }, 500);
    }
    return json(caseRow);
  }

  return json([]);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');
// Assert against the SAME generic negative body the controller sends, not a
// hand-copied duplicate — that is the whole point of the no-oracle rule.
const { NOT_FOUND_BODY } = await import('../../controllers/statusController.js');
const { REPORTER_MESSAGE_MAX } = await import('../../constants.js');

// A minimal case_reports row: the write path selects ONLY the id.
const foundCase = { id: 'case-uuid-1' };

beforeEach(() => {
  caseRow = null;
  caseSelectShouldError = false;
  notesInsertShouldError = false;
  insertedNote = null;
  fetchMock.mockClear();
});

describe('POST /api/status/message — valid reply', () => {
  it('returns 201 with a reporter-tagged note for a valid code + message', async () => {
    caseRow = foundCase;

    const res = await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-ABCD2345', message: 'Here is an update from me.' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.note).toEqual({
      note: 'Here is an update from me.',
      created_at: '2026-02-01T00:00:00.000Z',
      sender: 'reporter',
    });
  });

  it('inserts the note with sender:reporter, author_id:null, is_reporter_visible:true and NO identity', async () => {
    caseRow = foundCase;

    await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-ABCD2345', message: '  trim me  ' });

    const inserted = Array.isArray(insertedNote) ? insertedNote[0] : insertedNote;
    expect(inserted).toBeTruthy();
    expect(inserted.sender).toBe('reporter');
    expect(inserted.author_id).toBeNull();
    expect(inserted.is_reporter_visible).toBe(true);
    // The stored note is the TRIMMED message.
    expect(inserted.note).toBe('trim me');

    // ANONYMITY: the written row must carry nothing that could identify the
    // reporter — no email/phone/name/ip/session/user id.
    for (const forbidden of ['email', 'phone', 'name', 'ip', 'ip_address', 'session', 'session_id', 'user_id']) {
      expect(inserted).not.toHaveProperty(forbidden);
    }
  });
});

describe('POST /api/status/message — invalid message (400, no DB write)', () => {
  it('rejects an empty message with a 400 { errors: { message } } and no insert', async () => {
    caseRow = foundCase; // even with a real code, a bad message never reaches the DB

    const res = await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-ABCD2345', message: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors.message');
    expect(typeof res.body.errors.message).toBe('string');
    // No DB round-trip at all: neither the code lookup nor the insert happened.
    expect(insertedNote).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only message with a 400 and no insert', async () => {
    caseRow = foundCase;

    const res = await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-ABCD2345', message: '   \n\t  ' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors.message');
    expect(insertedNote).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a message longer than the max with a 400 and no insert', async () => {
    caseRow = foundCase;

    const res = await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-ABCD2345', message: 'x'.repeat(REPORTER_MESSAGE_MAX + 1) });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors.message');
    expect(insertedNote).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/status/message — nonexistent / missing code (generic 404, no oracle)', () => {
  it('returns the generic 404 body for a well-formed but nonexistent code', async () => {
    caseRow = null; // valid-shaped code, but no matching case

    const res = await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-NOSUCH99', message: 'A valid message body.' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    // No note was inserted for a code that matches nothing.
    expect(insertedNote).toBeNull();
  });

  it('returns the generic 404 body for a missing reference_code (valid message)', async () => {
    const res = await request(app)
      .post('/api/status/message')
      .send({ message: 'A valid message body.' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    expect(insertedNote).toBeNull();
  });

  it('returns the generic 404 body for a blank reference_code (valid message)', async () => {
    const res = await request(app)
      .post('/api/status/message')
      .send({ reference_code: '   ', message: 'A valid message body.' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    expect(insertedNote).toBeNull();
  });
});

describe('POST /api/status/message — DB error (generic 500, no leak)', () => {
  it('maps a code-lookup DB error to a generic 500 that leaks no code/message', async () => {
    caseSelectShouldError = true;

    const res = await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-ABCD2345', message: 'Some content that must not leak.' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    // The generic 500 must not echo the code or the message content back.
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('JN-ABCD2345');
    expect(serialised).not.toContain('Some content that must not leak.');
  });

  it('maps an insert DB error to a generic 500 that leaks no code/message', async () => {
    caseRow = foundCase;
    notesInsertShouldError = true;

    const res = await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-ABCD2345', message: 'Some content that must not leak.' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('JN-ABCD2345');
    expect(serialised).not.toContain('Some content that must not leak.');
  });
});

describe('POST /api/status/message — rate limiting (no oracle)', () => {
  it('returns the IDENTICAL generic 404 once rate-limited as for a not-found code', async () => {
    caseRow = null; // every attempt here is a miss

    // A genuine not-found first, to capture the baseline negative response.
    const notFound = await request(app)
      .post('/api/status/message')
      .send({ reference_code: 'JN-MISS0001', message: 'A valid message body.' });
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(NOT_FOUND_BODY);

    // The default cap is 10 attempts / window, shared per-IP. Fire well past it
    // (with valid messages so the 400 branch never intervenes) to guarantee we
    // cross the threshold.
    let rateLimited;
    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line no-await-in-loop -- must be sequential to trip
      rateLimited = await request(app)
        .post('/api/status/message')
        .send({ reference_code: 'JN-MISS0001', message: 'A valid message body.' });
    }

    // The throttled response must be byte-for-byte identical to a not-found —
    // same status AND same body — so the write endpoint is no oracle either.
    expect(rateLimited.status).toBe(404);
    expect(rateLimited.body).toEqual(NOT_FOUND_BODY);
    expect(rateLimited.status).toBe(notFound.status);
    expect(rateLimited.body).toEqual(notFound.body);
  });
});
