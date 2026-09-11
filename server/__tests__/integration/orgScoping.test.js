/**
 * Integration tests — server-side ORG-SCOPING (the authorization boundary).
 *
 * Follows the repo fetch-stub pattern (see reports.test.js / staffAdmin.test.js):
 * we do NOT hit a real database. We stub the global fetch the Supabase client
 * uses and hand back canned PostgREST responses; the stub is installed BEFORE
 * the app is imported, because the app builds its Supabase client at import time.
 * Guarded routes are exercised with REAL JWTs signed with process.env.JWT_SECRET.
 *
 * The property under test (CLAUDE.md: the server is the authorization boundary):
 *  - GET /api/reports: an officer/org_admin (org 'org-1') query MUST filter
 *    assigned_org_id=eq.org-1; a platform admin's query MUST carry NO org filter
 *    (it sees every case, including the unassigned queue).
 *  - GET /api/analytics: the SAME scoping — non-admin filters by org, admin does
 *    not.
 *  - Staff management: an org_admin listing staff filters to their OWN org; an
 *    org_admin creating a staffer CANNOT mint a platform admin (403) and the new
 *    account is FORCED into the org_admin's own org; a platform admin is
 *    unrestricted.
 *
 * (Case-detail cross-org 404 is already covered by caseDetail.test.js — not
 * duplicated here.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Capture the outgoing PostgREST URLs so we can assert the org filter (or its
// ABSENCE) directly on the query the app builds.
let caseReportsGetUrls = [];
let staffUsersGetUrls = [];
let staffInsertBody = null; // captures a staff_users POST body (the forced org)
let mutatedStaffRow = null; // the row a staff_users insert .select().single() returns

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';
  const json = (body, status = 200, extraHeaders = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...extraHeaders },
    });

  // audit_log inserts (best-effort) — swallow.
  if (method === 'POST' && target.includes('/rest/v1/audit_log')) {
    return json([], 201);
  }

  // organisations — create-validation lookup (id=eq.<id>.maybeSingle()) and the
  // staff-list name enrichment (id=in.(...)).
  if (target.includes('/rest/v1/organisations')) {
    if (target.includes('id=in.')) {
      return json([{ id: 'org-1', name: 'JusticeNow Dev Legal Aid' }]);
    }
    return json({ id: 'org-1' }); // the forced org exists
  }

  // case_reports — the list query (GET). Record every GET URL.
  if (target.includes('/rest/v1/case_reports')) {
    if (method === 'GET') {
      caseReportsGetUrls.push(target);
    }
    return json([]); // empty list is fine; we assert on the URL, not the rows
  }

  // staff_users — the admin list (GET) and create (POST).
  if (target.includes('/rest/v1/staff_users')) {
    if (method === 'POST') {
      staffInsertBody = options.body ? JSON.parse(options.body) : null;
      return json(mutatedStaffRow);
    }
    staffUsersGetUrls.push(target);
    return json([]); // empty list is fine; we assert on the URL / forced org
  }

  return json([], 200);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

// Real tokens for each role we exercise. org-1 is the "home" org.
const officerToken = jwt.sign(
  { sub: 'staff-officer', role: 'officer', org: 'org-1', method: 'password' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);
const orgAdminToken = jwt.sign(
  { sub: 'staff-orgadmin', role: 'org_admin', org: 'org-1', method: 'password' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);
const platformAdminToken = jwt.sign(
  { sub: 'staff-admin', role: 'admin', org: 'org-1', method: 'password' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// The org filter as PostgREST encodes it once the URL is decoded.
const ORG_FILTER = 'assigned_org_id=eq.org-1';

beforeEach(() => {
  caseReportsGetUrls = [];
  staffUsersGetUrls = [];
  staffInsertBody = null;
  mutatedStaffRow = null;
  fetchMock.mockClear();
});

describe('GET /api/reports — org scoping', () => {
  it('an officer query filters by their own org', async () => {
    const res = await request(app).get('/api/reports').set(bearer(officerToken));
    expect(res.status).toBe(200);

    const decoded = decodeURIComponent(caseReportsGetUrls.join('\n'));
    expect(decoded).toContain(ORG_FILTER);
  });

  it('an org_admin query filters by their own org', async () => {
    const res = await request(app).get('/api/reports').set(bearer(orgAdminToken));
    expect(res.status).toBe(200);

    const decoded = decodeURIComponent(caseReportsGetUrls.join('\n'));
    expect(decoded).toContain(ORG_FILTER);
  });

  it('a platform admin query carries NO org filter (sees every case)', async () => {
    const res = await request(app).get('/api/reports').set(bearer(platformAdminToken));
    expect(res.status).toBe(200);

    const decoded = decodeURIComponent(caseReportsGetUrls.join('\n'));
    // The admin must NOT be scoped to any org — no assigned_org_id filter at all.
    expect(decoded).not.toContain('assigned_org_id=eq.');
  });
});

describe('GET /api/analytics — org scoping', () => {
  it('an officer query filters by their own org', async () => {
    const res = await request(app).get('/api/analytics').set(bearer(officerToken));
    expect(res.status).toBe(200);

    const decoded = decodeURIComponent(caseReportsGetUrls.join('\n'));
    expect(decoded).toContain(ORG_FILTER);
  });

  it('an org_admin query filters by their own org', async () => {
    const res = await request(app).get('/api/analytics').set(bearer(orgAdminToken));
    expect(res.status).toBe(200);

    const decoded = decodeURIComponent(caseReportsGetUrls.join('\n'));
    expect(decoded).toContain(ORG_FILTER);
  });

  it('a platform admin query carries NO org filter (aggregates every org)', async () => {
    const res = await request(app).get('/api/analytics').set(bearer(platformAdminToken));
    expect(res.status).toBe(200);

    const decoded = decodeURIComponent(caseReportsGetUrls.join('\n'));
    expect(decoded).not.toContain('assigned_org_id=eq.');
  });
});

describe('GET /api/staff — org scoping of the admin list', () => {
  it('an org_admin list filters to their OWN org', async () => {
    const res = await request(app).get('/api/staff').set(bearer(orgAdminToken));
    expect(res.status).toBe(200);

    // The listing query must constrain organisation_id to the caller's org.
    const decoded = decodeURIComponent(staffUsersGetUrls.join('\n'));
    expect(decoded).toContain('organisation_id=eq.org-1');
  });

  it('a platform admin list carries NO org filter (sees every account)', async () => {
    const res = await request(app).get('/api/staff').set(bearer(platformAdminToken));
    expect(res.status).toBe(200);

    const decoded = decodeURIComponent(staffUsersGetUrls.join('\n'));
    expect(decoded).not.toContain('organisation_id=eq.');
  });
});

describe('POST /api/staff — org scoping of create', () => {
  it('an org_admin CANNOT create a platform admin (403, no insert)', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set(bearer(orgAdminToken))
      .send({
        name: 'Sneaky Admin',
        email: 'sneaky@justicenow.local',
        role: 'admin', // attempt to mint a platform superadmin
        organisation_id: 'org-1',
        password: 'SuperSecret1',
      });

    expect(res.status).toBe(403);
    expect(staffInsertBody).toBeNull();
  });

  it('an org_admin create is FORCED into their own org, ignoring a body org', async () => {
    mutatedStaffRow = {
      id: 'new-staff',
      name: 'Nimali Perera',
      email: 'nimali@justicenow.local',
      role: 'officer',
      organisation_id: 'org-1',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const res = await request(app)
      .post('/api/staff')
      .set(bearer(orgAdminToken))
      .send({
        name: 'Nimali Perera',
        email: 'nimali@justicenow.local',
        role: 'officer',
        organisation_id: 'org-999', // a DIFFERENT org — must be ignored/overridden
        password: 'SuperSecret1',
      });

    expect(res.status).toBe(201);
    // The insert body's org is the org_admin's OWN org, not the one they sent.
    expect(staffInsertBody.organisation_id).toBe('org-1');
  });

  it('a platform admin is unrestricted (may set any org)', async () => {
    mutatedStaffRow = {
      id: 'new-staff-2',
      name: 'Cross Org',
      email: 'cross@justicenow.local',
      role: 'officer',
      organisation_id: 'org-999',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const res = await request(app)
      .post('/api/staff')
      .set(bearer(platformAdminToken))
      .send({
        name: 'Cross Org',
        email: 'cross@justicenow.local',
        role: 'officer',
        organisation_id: 'org-999',
        password: 'SuperSecret1',
      });

    expect(res.status).toBe(201);
    // The platform admin's chosen org is honoured (no forcing).
    expect(staffInsertBody.organisation_id).toBe('org-999');
  });
});
