/**
 * Integration tests — staff case-detail routes under /api/reports/:id (U7).
 *
 * Follows the repo pattern (see reports.test.js / status.test.js): we do NOT hit
 * a real database. We stub the global fetch the Supabase client uses and hand
 * back canned PostgREST responses; the stub is installed BEFORE the app is
 * imported, because the app builds its Supabase client at import time. Guarded
 * routes are exercised with a REAL JWT signed with process.env.JWT_SECRET (the
 * same secret services/auth.js verifies against), so no DB login is needed.
 *
 * What we pin down here:
 *  - GET /:id returns the full case + ALL notes (internal AND reporter-visible)
 *    + allowed_transitions, and NEVER leaks the raw evidence_path;
 *  - GET /:id → generic 404 for an unknown id, and 401 without a staff token;
 *  - POST /:id/notes creates a note with author_id, writes a note_added audit
 *    whose detail does NOT contain the note text, and 400s an empty note;
 *  - PATCH /:id/status: an allowed transition succeeds + writes status_changed;
 *    a disallowed one → 403; referred→under_review with no reason → 400; an
 *    admin reopening closed→under_review succeeds;
 *  - PATCH /:id/assign: an inactive/nonexistent org → 400; a valid one → 200 +
 *    case_assigned audit.
 *
 * EVIDENCE-URL GAP (noted explicitly): every fixture case here has
 * evidence_path = null, so the Storage createSignedUrl path is never hit. That
 * path is isolated in caseService.getEvidenceUrl() precisely so it stays
 * mockable; the fetch-stub style does not cover Supabase Storage's REST shape
 * cleanly, so the signed-URL branch is left uncovered here by design and should
 * be unit-tested against a mocked supabase.storage in a follow-up.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Test doubles the fetch stub returns, reset per-test.
let caseRow = null; // the case_reports row (or null for not-found)
let noteRows = []; // the case_notes rows returned by the notes select
let staffRows = []; // the staff_users rows returned by the author-name lookup
let orgRow = null; // the organisations row for the assigned-org / assign lookups
let insertedNote = null; // captures a case_notes insert body
let auditBodies = []; // captures every audit_log insert body
let statusUpdateBody = null; // captures a case_reports status/assign update body

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  // --- audit_log inserts (best-effort; capture the body) ---
  if (method === 'POST' && target.includes('/rest/v1/audit_log')) {
    const parsed = options.body ? JSON.parse(options.body) : null;
    auditBodies.push(Array.isArray(parsed) ? parsed[0] : parsed);
    return json([], 201);
  }

  // --- case_notes ---
  if (target.includes('/rest/v1/case_notes')) {
    if (method === 'POST') {
      insertedNote = options.body ? JSON.parse(options.body) : null;
      const row = Array.isArray(insertedNote) ? insertedNote[0] : insertedNote;
      // The insert uses .select(...).single() → PostgREST returns the row.
      return json({
        id: 'note-new',
        note: row.note,
        is_reporter_visible: row.is_reporter_visible,
        author_id: row.author_id,
        created_at: '2026-02-01T00:00:00.000Z',
      });
    }
    return json(noteRows);
  }

  // --- staff_users (author-name lookup, id=in.(...)) ---
  if (target.includes('/rest/v1/staff_users')) {
    return json(staffRows);
  }

  // --- organisations (assigned-org load, and assign-validation) ---
  if (target.includes('/rest/v1/organisations')) {
    return json(orgRow);
  }

  // --- case_reports ---
  if (target.includes('/rest/v1/case_reports')) {
    if (method === 'PATCH') {
      statusUpdateBody = options.body ? JSON.parse(options.body) : null;
      return json([], 200);
    }
    // maybeSingle() → object or null.
    return json(caseRow);
  }

  return json([], 200);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

// Real tokens, signed with the same secret services/auth.js verifies against.
const officerToken = jwt.sign(
  { sub: 'staff-officer', role: 'officer', org: 'org-1' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);
const adminToken = jwt.sign(
  { sub: 'staff-admin', role: 'admin', org: 'org-1' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// A full case row as case_reports would return it (evidence_path = null, so the
// Storage signed-URL path is not exercised — see the header note).
const baseCase = {
  id: 'case-1',
  reference_code: 'JN-ABCD2345',
  case_type: 'land_dispute',
  incident_date: '2026-01-10',
  district: 'Jaffna',
  description: 'Sensitive narrative that staff may read but must never be logged.',
  evidence_path: null,
  status: 'received',
  // Assigned to the officer's org so the org-scoping guard lets a non-platform
  // staffer open it (platform admin bypasses scoping regardless).
  assigned_org_id: 'org-1',
  created_at: '2026-01-11T08:00:00.000Z',
  updated_at: '2026-01-12T09:30:00.000Z',
};

beforeEach(() => {
  caseRow = null;
  noteRows = [];
  staffRows = [];
  orgRow = null;
  insertedNote = null;
  auditBodies = [];
  statusUpdateBody = null;
  fetchMock.mockClear();
});

describe('GET /api/reports/:id — staff full view', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/reports/case-1');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns the full case with internal AND reporter-visible notes and allowed_transitions', async () => {
    caseRow = { ...baseCase, status: 'received' };
    noteRows = [
      {
        id: 'n1',
        note: 'Internal triage note.',
        is_reporter_visible: false,
        author_id: 'staff-officer',
        created_at: '2026-01-11T10:00:00.000Z',
      },
      {
        id: 'n2',
        note: 'Update for the reporter.',
        is_reporter_visible: true,
        author_id: 'staff-officer',
        created_at: '2026-01-12T09:30:00.000Z',
      },
    ];
    staffRows = [{ id: 'staff-officer', name: 'Officer One' }];

    const res = await request(app).get('/api/reports/case-1').set(bearer(officerToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;

    // Full case fields present, including the narrative staff may read.
    expect(data.reference_code).toBe('JN-ABCD2345');
    expect(data.description).toBe(baseCase.description);
    expect(data.assigned_org_id).toBe('org-1');

    // Evidence: only has_evidence + evidence_url. The raw path must NOT leak.
    expect(data.has_evidence).toBe(false);
    expect(data.evidence_url).toBeNull();
    expect(data).not.toHaveProperty('evidence_path');

    // BOTH notes returned (internal + visible), each carrying its visibility
    // flag and the resolved author name.
    expect(data.notes).toHaveLength(2);
    expect(data.notes[0].is_reporter_visible).toBe(false);
    expect(data.notes[1].is_reporter_visible).toBe(true);
    expect(data.notes[0].author_name).toBe('Officer One');

    // allowed_transitions for an officer on a "received" case: under_review, closed.
    expect(data.allowed_transitions.sort()).toEqual(['closed', 'under_review']);
  });

  it('returns a generic 404 for an unknown id', async () => {
    caseRow = null;
    const res = await request(app)
      .get('/api/reports/does-not-exist')
      .set(bearer(officerToken));
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/reports/:id/notes', () => {
  it('creates a note with author_id and writes a note_added audit WITHOUT the note text', async () => {
    caseRow = { ...baseCase }; // assertCaseExists passes
    staffRows = [{ id: 'staff-officer', name: 'Officer One' }];

    const secretNote = 'Confidential detail that must never reach the audit trail.';
    const res = await request(app)
      .post('/api/reports/case-1/notes')
      .set(bearer(officerToken))
      .send({ note: secretNote, is_reporter_visible: true });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.note).toBe(secretNote);
    expect(res.body.data.author_name).toBe('Officer One');

    // The note was inserted with the acting staff member's id.
    const inserted = Array.isArray(insertedNote) ? insertedNote[0] : insertedNote;
    expect(inserted.author_id).toBe('staff-officer');
    expect(inserted.is_reporter_visible).toBe(true);

    // AUDIT: exactly one note_added, and its detail carries ONLY the visibility
    // flag — never the note text (that is case content).
    const audit = auditBodies.find((a) => a.action === 'note_added');
    expect(audit).toBeTruthy();
    expect(audit.detail).toEqual({ is_reporter_visible: true });
    expect(JSON.stringify(audit)).not.toContain(secretNote);
  });

  it('rejects an empty note with 400', async () => {
    caseRow = { ...baseCase };
    const res = await request(app)
      .post('/api/reports/case-1/notes')
      .set(bearer(officerToken))
      .send({ note: '   ', is_reporter_visible: false });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // Nothing inserted, no audit written on a validation failure.
    expect(insertedNote).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });
});

describe('PATCH /api/reports/:id/status', () => {
  it('allows received→under_review for an officer and writes a status_changed audit', async () => {
    caseRow = { ...baseCase, status: 'received' };

    const res = await request(app)
      .patch('/api/reports/case-1/status')
      .set(bearer(officerToken))
      .send({ status: 'under_review' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('under_review');
    expect(statusUpdateBody.status).toBe('under_review');

    const audit = auditBodies.find((a) => a.action === 'status_changed');
    expect(audit).toBeTruthy();
    expect(audit.detail).toEqual({
      from: 'received',
      to: 'under_review',
      reason: null,
    });
  });

  it('rejects a disallowed transition (closed→under_review by officer) with 403', async () => {
    caseRow = { ...baseCase, status: 'closed' };

    const res = await request(app)
      .patch('/api/reports/case-1/status')
      .set(bearer(officerToken))
      .send({ status: 'under_review' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    // No update, no audit on a rejected transition.
    expect(statusUpdateBody).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('rejects referred→under_review WITHOUT a reason with 400', async () => {
    caseRow = { ...baseCase, status: 'referred' };

    const res = await request(app)
      .patch('/api/reports/case-1/status')
      .set(bearer(officerToken))
      .send({ status: 'under_review' }); // no reason

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(statusUpdateBody).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('allows an admin to reopen closed→under_review', async () => {
    caseRow = { ...baseCase, status: 'closed' };

    const res = await request(app)
      .patch('/api/reports/case-1/status')
      .set(bearer(adminToken))
      .send({ status: 'under_review' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('under_review');
    const audit = auditBodies.find((a) => a.action === 'status_changed');
    expect(audit.detail).toEqual({ from: 'closed', to: 'under_review', reason: null });
  });

  it('rejects an unknown target status with 400', async () => {
    caseRow = { ...baseCase, status: 'received' };
    const res = await request(app)
      .patch('/api/reports/case-1/status')
      .set(bearer(officerToken))
      .send({ status: 'archived' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(statusUpdateBody).toBeNull();
  });
});

describe('PATCH /api/reports/:id/assign', () => {
  it('rejects assigning to an inactive/nonexistent org with 400', async () => {
    caseRow = { ...baseCase };
    orgRow = null; // org lookup finds nothing

    const res = await request(app)
      .patch('/api/reports/case-1/assign')
      .set(bearer(officerToken))
      .send({ assigned_org_id: 'org-gone' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(statusUpdateBody).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('assigns to a valid active org (200) and writes a case_assigned audit', async () => {
    caseRow = { ...baseCase };
    orgRow = { id: 'org-2', is_active: true };

    const res = await request(app)
      .patch('/api/reports/case-1/assign')
      .set(bearer(officerToken))
      .send({ assigned_org_id: 'org-2' });

    expect(res.status).toBe(200);
    expect(res.body.data.assigned_org_id).toBe('org-2');
    expect(statusUpdateBody.assigned_org_id).toBe('org-2');

    const audit = auditBodies.find((a) => a.action === 'case_assigned');
    expect(audit).toBeTruthy();
    expect(audit.detail).toEqual({ assigned_org_id: 'org-2' });
  });

  it('unassigns when assigned_org_id is null (200)', async () => {
    // In the officer's org (org-1) so the scoping guard permits access; the test
    // then clears the assignment.
    caseRow = { ...baseCase };

    const res = await request(app)
      .patch('/api/reports/case-1/assign')
      .set(bearer(officerToken))
      .send({ assigned_org_id: null });

    expect(res.status).toBe(200);
    expect(res.body.data.assigned_org_id).toBeNull();
    expect(statusUpdateBody.assigned_org_id).toBeNull();
  });
});
