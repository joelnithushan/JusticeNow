/**
 * Integration tests — /api/audit (ADMIN-only audit trail, U9).
 *
 * Follows the repo fetch-stub pattern (see analytics.test.js / caseDetail.test.js):
 * we do NOT hit a real database. We stub the global fetch the Supabase client
 * uses and hand back canned PostgREST responses; the stub is installed BEFORE the
 * app is imported, because the app builds its Supabase client at import time.
 * Guarded routes are exercised with REAL JWTs signed with process.env.JWT_SECRET.
 *
 * What we pin down here:
 *  - AUTH: no token → 401; a NON-admin (officer) token → 403; an admin token → 200.
 *    This is the ADMIN-ONLY boundary from CLAUDE.md's authorization matrix.
 *  - ENRICHMENT: entries carry actor_name (from staff_users) and case_reference
 *    (from case_reports), with null actor/case mapping to null names.
 *  - PAGINATION: has_more is true when a full-plus-one page comes back; the
 *    Supabase Range header reflects the requested offset/limit (and the probe row).
 *  - VALIDATION: an invalid `action` filter → 400.
 *  - PRIVACY: the response never leaks case narrative/notes — `detail` passes
 *    through only the WHO/WHAT metadata we stored.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Test doubles the fetch stub returns, reset per-test.
let auditRows = []; // rows the audit_log select returns
let staffRows = []; // rows the staff_users (actor-name) lookup returns
let caseRows = []; // rows the case_reports (reference-code) lookup returns

// Capture what the app asked audit_log for, so we can assert on pagination.
let lastAuditUrl = null;

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  if (target.includes('/rest/v1/audit_log')) {
    lastAuditUrl = target;
    return json(auditRows);
  }
  if (target.includes('/rest/v1/staff_users')) {
    return json(staffRows);
  }
  if (target.includes('/rest/v1/case_reports')) {
    return json(caseRows);
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

// This Supabase/PostgREST client renders .range(start, end) as `offset` +
// `limit` query params (offset = start, limit = end - start + 1), not a Range
// header. We assert on the decoded URL the app actually sent.
function auditQuery() {
  return decodeURIComponent(lastAuditUrl || '');
}

beforeEach(() => {
  auditRows = [];
  staffRows = [];
  caseRows = [];
  lastAuditUrl = null;
  fetchMock.mockClear();
});

describe('GET /api/audit — authorization (ADMIN only)', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a non-admin (officer) staff token with 403', async () => {
    const res = await request(app).get('/api/audit').set(bearer(officerToken));
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('allows an admin token (200)', async () => {
    auditRows = [];
    const res = await request(app).get('/api/audit').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.entries).toEqual([]);
    expect(res.body.data.has_more).toBe(false);
  });
});

describe('GET /api/audit — enrichment', () => {
  it('enriches entries with actor_name and case_reference, null → null', async () => {
    auditRows = [
      {
        id: 'a1',
        case_id: 'case-1',
        actor_id: 'staff-admin',
        action: 'status_changed',
        detail: { from: 'received', to: 'under_review', reason: null },
        created_at: '2026-02-01T10:00:00.000Z',
      },
      {
        // A system/null-actor row with no case — both names resolve to null.
        id: 'a2',
        case_id: null,
        actor_id: null,
        action: 'staff_login',
        detail: null,
        created_at: '2026-02-01T09:00:00.000Z',
      },
    ];
    staffRows = [{ id: 'staff-admin', name: 'Admin One' }];
    caseRows = [{ id: 'case-1', reference_code: 'JN-ABCD2345' }];

    const res = await request(app).get('/api/audit').set(bearer(adminToken));
    expect(res.status).toBe(200);

    const { entries, has_more } = res.body.data;
    expect(has_more).toBe(false);
    expect(entries).toHaveLength(2);

    // First entry: enriched with actor name + case reference; detail passes through.
    expect(entries[0]).toEqual({
      id: 'a1',
      action: 'status_changed',
      actor_id: 'staff-admin',
      actor_name: 'Admin One',
      case_id: 'case-1',
      case_reference: 'JN-ABCD2345',
      detail: { from: 'received', to: 'under_review', reason: null },
      created_at: '2026-02-01T10:00:00.000Z',
    });

    // Second entry: null actor and null case → null names, not thrown.
    expect(entries[1].actor_name).toBeNull();
    expect(entries[1].case_reference).toBeNull();
    expect(entries[1].detail).toBeNull();

    // PRIVACY: nothing case-content-like leaked into the serialized body.
    const serialized = JSON.stringify(res.body);
    for (const forbidden of ['description', 'evidence_path', 'note', 'email', 'phone']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('GET /api/audit — pagination', () => {
  it('reports has_more and requests the right range (offset/limit + probe row)', async () => {
    // Ask for limit=2, offset=4. The service fetches limit+1 (=3) rows to detect
    // another page, then trims back to 2.
    auditRows = [
      { id: 'r1', case_id: null, actor_id: null, action: 'org_created', detail: null, created_at: '2026-02-05T00:00:00.000Z' },
      { id: 'r2', case_id: null, actor_id: null, action: 'org_updated', detail: null, created_at: '2026-02-04T00:00:00.000Z' },
      { id: 'r3', case_id: null, actor_id: null, action: 'org_deleted', detail: null, created_at: '2026-02-03T00:00:00.000Z' },
    ];

    const res = await request(app)
      .get('/api/audit?limit=2&offset=4')
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    // Only 2 returned (probe trimmed), and has_more true (a 3rd row existed).
    expect(res.body.data.entries).toHaveLength(2);
    expect(res.body.data.has_more).toBe(true);
    expect(res.body.data.entries.map((e) => e.id)).toEqual(['r1', 'r2']);

    // The query must reflect offset 4 and pull limit+1 (=3) rows — the extra
    // probe row is how has_more is detected without a separate count.
    const q = auditQuery();
    expect(q).toContain('offset=4');
    expect(q).toContain('limit=3');
  });

  it('has_more is false when the page is not full', async () => {
    auditRows = [
      { id: 'r1', case_id: null, actor_id: null, action: 'staff_login', detail: null, created_at: '2026-02-05T00:00:00.000Z' },
    ];
    const res = await request(app)
      .get('/api/audit?limit=50')
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.entries).toHaveLength(1);
    expect(res.body.data.has_more).toBe(false);
    // Default offset 0, and limit+1 (=51) rows fetched (probe row included).
    const q = auditQuery();
    expect(q).toContain('offset=0');
    expect(q).toContain('limit=51');
  });
});

describe('GET /api/audit — validation', () => {
  it('rejects an invalid action filter with 400', async () => {
    const res = await request(app)
      .get('/api/audit?action=not_a_real_action')
      .set(bearer(adminToken));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // The audit_log table must NOT have been queried on a validation failure.
    expect(lastAuditUrl).toBeNull();
  });

  it('rejects a negative offset with 400', async () => {
    const res = await request(app)
      .get('/api/audit?offset=-1')
      .set(bearer(adminToken));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(lastAuditUrl).toBeNull();
  });

  it('accepts and applies a valid action filter (eq)', async () => {
    auditRows = [
      { id: 'r1', case_id: 'case-9', actor_id: 'staff-admin', action: 'case_assigned', detail: { assigned_org_id: 'org-2' }, created_at: '2026-02-05T00:00:00.000Z' },
    ];
    staffRows = [{ id: 'staff-admin', name: 'Admin One' }];
    caseRows = [{ id: 'case-9', reference_code: 'JN-WXYZ7788' }];

    const res = await request(app)
      .get('/api/audit?action=case_assigned')
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.entries[0].action).toBe('case_assigned');
    // The eq filter is in the audit_log query string.
    expect(decodeURIComponent(lastAuditUrl || '')).toContain('action=eq.case_assigned');
  });
});
