/**
 * Integration tests — /api/organisations ADMIN mutations (U10).
 *
 * Follows the repo fetch-stub pattern (see organisations.test.js /
 * caseDetail.test.js / audit.test.js): we do NOT hit a real database. We stub the
 * global fetch the Supabase client uses and hand back canned PostgREST responses;
 * the stub is installed BEFORE the app is imported, because the app builds its
 * Supabase client at import time. Guarded routes are exercised with REAL JWTs
 * signed with process.env.JWT_SECRET (the same secret services/auth.js verifies).
 *
 * What we pin down here (the ADMIN boundary from CLAUDE.md's authorization
 * matrix — "Manage organisations and staff" is admin):
 *  - AUTH on GET /all, POST /, PUT /:id, DELETE /:id: no token → 401; an officer
 *    token → 403; an admin token → success.
 *  - GET /all returns inactive orgs too (unlike the public GET /).
 *  - create validation: missing name / bad district / bad case_type → 400 and
 *    NO insert is issued.
 *  - create success writes an org_created audit; update writes org_updated.
 *  - DELETE performs a SOFT delete: it issues a PATCH setting is_active=false
 *    (never a DB DELETE — that would cascade-delete the org's staff_users) and
 *    writes an org_deleted audit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Test doubles the fetch stub returns / captures, reset per-test.
let orgListRows = []; // rows the admin list (GET /all) returns
let mutatedRow = null; // row an insert/update/patch .select().single/maybeSingle returns
let insertBody = null; // captures a POST organisations body
let updateBody = null; // captures a PATCH organisations body
let updateMethod = null; // the HTTP method of the organisations write (PATCH here)
let auditBodies = []; // captures every audit_log insert body
let sawOrgDbDelete = false; // set true if a DB DELETE ever hits organisations

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

  // --- organisations ---
  if (target.includes('/rest/v1/organisations')) {
    if (method === 'POST') {
      insertBody = options.body ? JSON.parse(options.body) : null;
      return json(mutatedRow); // insert().select().single() → the created row
    }
    if (method === 'PATCH') {
      updateMethod = 'PATCH';
      updateBody = options.body ? JSON.parse(options.body) : null;
      return json(mutatedRow); // update().select().maybeSingle() → row or null
    }
    if (method === 'DELETE') {
      // A hard DELETE must NEVER be issued against organisations — it would
      // cascade-delete the org's staff_users. Record it so the test can fail.
      sawOrgDbDelete = true;
      return json([], 200);
    }
    return json(orgListRows); // GET /all list
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

// An admin org row as the ADMIN_ORG_COLUMNS projection returns it (incl. is_active).
const activeOrg = {
  id: 'org-uuid-1',
  name: 'Jaffna Legal Aid Centre',
  description: 'Free legal advice in the north.',
  district: 'Jaffna',
  case_types: ['land_dispute', 'unlawful_detention'],
  contact_phone: '+94 21 222 3344',
  contact_email: 'help@jaffnalegal.example',
  is_active: true,
};
const inactiveOrg = {
  id: 'org-uuid-2',
  name: 'Closed Advocacy Trust',
  description: null,
  district: 'Colombo',
  case_types: [],
  contact_phone: null,
  contact_email: null,
  is_active: false,
};

beforeEach(() => {
  orgListRows = [];
  mutatedRow = null;
  insertBody = null;
  updateBody = null;
  updateMethod = null;
  auditBodies = [];
  sawOrgDbDelete = false;
  fetchMock.mockClear();
});

describe('GET /api/organisations/all — admin list (auth + inactive)', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/organisations/all');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a non-admin (officer) token with 403', async () => {
    const res = await request(app)
      .get('/api/organisations/all')
      .set(bearer(officerToken));
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns ALL orgs incl. inactive for an admin (unlike the public list)', async () => {
    orgListRows = [activeOrg, inactiveOrg];
    const res = await request(app)
      .get('/api/organisations/all')
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    // The inactive org is present, with its is_active flag exposed to the admin.
    const inactive = res.body.data.find((o) => o.id === 'org-uuid-2');
    expect(inactive).toBeTruthy();
    expect(inactive.is_active).toBe(false);
  });
});

describe('POST /api/organisations — admin create', () => {
  it('rejects an unauthenticated caller with 401 (no insert)', async () => {
    const res = await request(app)
      .post('/api/organisations')
      .send({ name: 'X', district: 'Jaffna' });
    expect(res.status).toBe(401);
    expect(insertBody).toBeNull();
  });

  it('rejects an officer token with 403 (no insert)', async () => {
    const res = await request(app)
      .post('/api/organisations')
      .set(bearer(officerToken))
      .send({ name: 'X', district: 'Jaffna' });
    expect(res.status).toBe(403);
    expect(insertBody).toBeNull();
  });

  it('creates an org for an admin and writes an org_created audit', async () => {
    mutatedRow = activeOrg;
    const res = await request(app)
      .post('/api/organisations')
      .set(bearer(adminToken))
      .send({
        name: 'Jaffna Legal Aid Centre',
        district: 'Jaffna',
        case_types: ['land_dispute', 'unlawful_detention'],
        contact_phone: '+94 21 222 3344',
        contact_email: 'help@jaffnalegal.example',
        description: 'Free legal advice in the north.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('org-uuid-1');
    expect(res.body.data.is_active).toBe(true);

    // The insert carried the validated fields.
    expect(insertBody.name).toBe('Jaffna Legal Aid Centre');
    expect(insertBody.district).toBe('Jaffna');

    // AUDIT: exactly one org_created with only { organisation_id, name }.
    const audit = auditBodies.find((a) => a.action === 'org_created');
    expect(audit).toBeTruthy();
    expect(audit.detail).toEqual({
      organisation_id: 'org-uuid-1',
      name: 'Jaffna Legal Aid Centre',
    });
  });

  it('rejects a missing name with 400 and no insert', async () => {
    const res = await request(app)
      .post('/api/organisations')
      .set(bearer(adminToken))
      .send({ district: 'Jaffna' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/name/i);
    expect(insertBody).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('rejects a bad district with 400 and no insert', async () => {
    const res = await request(app)
      .post('/api/organisations')
      .set(bearer(adminToken))
      .send({ name: 'Somewhere', district: 'Atlantis' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/district/i);
    expect(insertBody).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('rejects a bad case_type with 400 and no insert', async () => {
    const res = await request(app)
      .post('/api/organisations')
      .set(bearer(adminToken))
      .send({ name: 'Somewhere', district: 'Jaffna', case_types: ['nonsense'] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/case_types/i);
    expect(insertBody).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });
});

describe('PUT /api/organisations/:id — admin update', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app)
      .put('/api/organisations/org-uuid-1')
      .send({ name: 'New name' });
    expect(res.status).toBe(401);
    expect(updateBody).toBeNull();
  });

  it('rejects an officer token with 403', async () => {
    const res = await request(app)
      .put('/api/organisations/org-uuid-1')
      .set(bearer(officerToken))
      .send({ name: 'New name' });
    expect(res.status).toBe(403);
    expect(updateBody).toBeNull();
  });

  it('updates an org for an admin and writes an org_updated audit', async () => {
    mutatedRow = { ...activeOrg, name: 'Renamed Centre' };
    const res = await request(app)
      .put('/api/organisations/org-uuid-1')
      .set(bearer(adminToken))
      .send({ name: 'Renamed Centre', is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed Centre');
    expect(updateBody.name).toBe('Renamed Centre');
    // is_active is a permitted update field and was coerced to a boolean.
    expect(updateBody.is_active).toBe(false);

    const audit = auditBodies.find((a) => a.action === 'org_updated');
    expect(audit).toBeTruthy();
    expect(audit.detail).toEqual({ organisation_id: 'org-uuid-1' });
  });

  it('rejects a bad district on update with 400', async () => {
    const res = await request(app)
      .put('/api/organisations/org-uuid-1')
      .set(bearer(adminToken))
      .send({ district: 'Atlantis' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/district/i);
    expect(updateBody).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('returns 404 when the org does not exist', async () => {
    mutatedRow = null; // update().select().maybeSingle() → null (no such row)
    const res = await request(app)
      .put('/api/organisations/missing')
      .set(bearer(adminToken))
      .send({ name: 'New name' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    // A 404 must not write an audit row.
    expect(auditBodies).toHaveLength(0);
  });
});

describe('DELETE /api/organisations/:id — admin SOFT delete', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).delete('/api/organisations/org-uuid-1');
    expect(res.status).toBe(401);
  });

  it('rejects an officer token with 403', async () => {
    const res = await request(app)
      .delete('/api/organisations/org-uuid-1')
      .set(bearer(officerToken));
    expect(res.status).toBe(403);
  });

  it('SOFT-deletes (PATCH is_active=false, no DB DELETE) and writes org_deleted', async () => {
    mutatedRow = { ...activeOrg, is_active: false };
    const res = await request(app)
      .delete('/api/organisations/org-uuid-1')
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.is_active).toBe(false);

    // The deactivation is an UPDATE setting is_active=false — NOT a DB DELETE
    // (which would cascade-delete the org's staff_users).
    expect(updateMethod).toBe('PATCH');
    expect(updateBody).toEqual({ is_active: false });
    expect(sawOrgDbDelete).toBe(false);

    const audit = auditBodies.find((a) => a.action === 'org_deleted');
    expect(audit).toBeTruthy();
    expect(audit.detail).toEqual({ organisation_id: 'org-uuid-1' });
  });

  it('returns 404 when the org does not exist (no audit)', async () => {
    mutatedRow = null;
    const res = await request(app)
      .delete('/api/organisations/missing')
      .set(bearer(adminToken));

    expect(res.status).toBe(404);
    expect(sawOrgDbDelete).toBe(false);
    expect(auditBodies).toHaveLength(0);
  });
});
