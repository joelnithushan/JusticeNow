/**
 * Integration tests — /api/staff ADMIN staff-account CRUD (U11).
 *
 * Follows the repo fetch-stub pattern (see organisationsAdmin.test.js): we do
 * NOT hit a real database. We stub the global fetch the Supabase client uses and
 * hand back canned PostgREST responses; the stub is installed BEFORE the app is
 * imported, because the app builds its Supabase client at import time. Guarded
 * routes are exercised with REAL JWTs signed with process.env.JWT_SECRET (the
 * same secret services/auth.js verifies).
 *
 * We use REAL bcryptjs so the "the create stored a genuine hash" assertion is
 * meaningful (compareSync against the plaintext must pass).
 *
 * What we pin down (the ADMIN boundary — "Manage organisations and staff" is
 * admin, CLAUDE.md authorization matrix):
 *  - AUTH on GET / POST / PUT / DELETE: no token → 401; officer → 403; admin → ok.
 *  - create stores a bcrypt HASH (never the plaintext), never returns it;
 *    missing password / bad role / bad email / missing org → 400; duplicate
 *    email (23505) → 400.
 *  - update rehashes a supplied password; email/role validation enforced.
 *  - deactivate SOFT-deletes (PATCH is_active=false, never a DB DELETE) + writes
 *    staff_deleted; refuses to deactivate the caller's own account and the last
 *    active admin (both 400).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// Test doubles the fetch stub returns / captures, reset per-test.
let staffListRows = []; // rows the admin list (GET /) returns
let mutatedRow = null; // row an insert/update/patch .select().single/maybeSingle returns
let orgLookupRow = { id: 'org-1' }; // organisations lookup during validation (null = missing)
let targetStaffRow = null; // staff lookup used by deactivate (role/is_active)
let adminCount = 2; // active-admin count returned to the last-admin guard
let insertBody = null; // captures a POST staff_users body
let updateBody = null; // captures a PATCH staff_users body
let updateMethod = null; // HTTP method of the staff_users write (PATCH here)
let auditBodies = []; // every audit_log insert body
let sawStaffDbDelete = false; // set true if a DB DELETE ever hits staff_users
let insertError = null; // when set, a staff_users POST returns this PostgREST error
let updateError = null; // when set, a staff_users PATCH returns this PostgREST error

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';
  const json = (body, status = 200, extraHeaders = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...extraHeaders },
    });

  // --- audit_log inserts (best-effort; capture the body) ---
  if (method === 'POST' && target.includes('/rest/v1/audit_log')) {
    const parsed = options.body ? JSON.parse(options.body) : null;
    auditBodies.push(Array.isArray(parsed) ? parsed[0] : parsed);
    return json([], 201);
  }

  // --- organisations ---
  if (target.includes('/rest/v1/organisations')) {
    // Enrichment on the staff list uses id=in.(...) and expects an ARRAY of
    // { id, name }; the create/update validation uses id=eq.<id>.maybeSingle()
    // and expects a single object (or null).
    if (target.includes('id=in.')) {
      // Return a name for every requested org id so the enrichment succeeds.
      return json([{ id: 'org-1', name: 'JusticeNow Dev Legal Aid' }]);
    }
    return json(orgLookupRow);
  }

  // --- staff_users ---
  if (target.includes('/rest/v1/staff_users')) {
    if (method === 'POST') {
      insertBody = options.body ? JSON.parse(options.body) : null;
      if (insertError) return json(insertError, 400);
      return json(mutatedRow); // insert().select().single() → created row
    }
    if (method === 'PATCH') {
      updateMethod = 'PATCH';
      updateBody = options.body ? JSON.parse(options.body) : null;
      if (updateError) return json(updateError, 400);
      return json(mutatedRow); // update().select().maybeSingle() → row or null
    }
    if (method === 'DELETE') {
      // A hard DELETE must NEVER be issued against staff_users — it would strip
      // the actor from the audit trail. Record it so the test can fail.
      sawStaffDbDelete = true;
      return json([], 200);
    }
    // The active-admin COUNT is a HEAD request (supabase head:true). PostgREST
    // returns the count in the content-range header; the client reads it there.
    if (
      method === 'HEAD' ||
      (target.includes('role=eq.admin') && target.includes('is_active=eq.true'))
    ) {
      return json([], 200, { 'content-range': `0-0/${adminCount}` });
    }
    // The deactivate target lookup selects exactly id,role,is_active.
    if (target.includes('select=id%2Crole%2Cis_active')) {
      return json(targetStaffRow);
    }
    // Otherwise: the admin list (GET /).
    return json(staffListRows);
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

// A staff row as SAFE_STAFF_COLUMNS returns it — note: NO password_hash.
const safeStaff = {
  id: 'staff-uuid-1',
  name: 'Nimali Perera',
  email: 'nimali@justicenow.local',
  role: 'officer',
  organisation_id: 'org-1',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  staffListRows = [];
  mutatedRow = null;
  orgLookupRow = { id: 'org-1' };
  targetStaffRow = null;
  adminCount = 2;
  insertBody = null;
  updateBody = null;
  updateMethod = null;
  auditBodies = [];
  sawStaffDbDelete = false;
  insertError = null;
  updateError = null;
  fetchMock.mockClear();
});

describe('GET /api/staff — admin list (auth + no password_hash)', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a non-admin (officer) token with 403', async () => {
    const res = await request(app).get('/api/staff').set(bearer(officerToken));
    expect(res.status).toBe(403);
  });

  it('returns all staff for an admin, never including password_hash', async () => {
    staffListRows = [safeStaff, { ...safeStaff, id: 'staff-uuid-2', is_active: false }];
    const res = await request(app).get('/api/staff').set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    for (const s of res.body.data) {
      expect(s).not.toHaveProperty('password_hash');
    }
  });
});

describe('POST /api/staff — admin create', () => {
  const validBody = {
    name: 'Nimali Perera',
    email: 'Nimali@JusticeNow.local',
    role: 'officer',
    organisation_id: 'org-1',
    password: 'SuperSecret1',
  };

  it('rejects an unauthenticated caller with 401 (no insert)', async () => {
    const res = await request(app).post('/api/staff').send(validBody);
    expect(res.status).toBe(401);
    expect(insertBody).toBeNull();
  });

  it('rejects an officer token with 403 (no insert)', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set(bearer(officerToken))
      .send(validBody);
    expect(res.status).toBe(403);
    expect(insertBody).toBeNull();
  });

  it('creates a staff member, storing a bcrypt HASH (not the plaintext) and never returning it', async () => {
    mutatedRow = safeStaff;
    const res = await request(app)
      .post('/api/staff')
      .set(bearer(adminToken))
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('staff-uuid-1');
    // The response NEVER carries the hash.
    expect(res.body.data).not.toHaveProperty('password_hash');

    // The insert stored a genuine bcrypt hash of the plaintext — never the
    // plaintext itself.
    expect(insertBody.password_hash).toBeTruthy();
    expect(insertBody.password_hash).not.toBe(validBody.password);
    expect(bcrypt.compareSync(validBody.password, insertBody.password_hash)).toBe(true);
    // Email was normalised to lowercase.
    expect(insertBody.email).toBe('nimali@justicenow.local');
    // The body must not carry a plaintext password field to the DB.
    expect(insertBody).not.toHaveProperty('password');

    const audit = auditBodies.find((a) => a.action === 'staff_created');
    expect(audit).toBeTruthy();
    // Audit detail carries ONLY non-sensitive metadata — never email/hash.
    expect(audit.detail).toEqual({ staff_id: 'staff-uuid-1', role: 'officer' });
    expect(JSON.stringify(audit.detail)).not.toContain('password');
    expect(JSON.stringify(audit.detail)).not.toContain('@');
  });

  it('rejects a missing password with 400 and no insert', async () => {
    const { password, ...noPassword } = validBody;
    void password;
    const res = await request(app)
      .post('/api/staff')
      .set(bearer(adminToken))
      .send(noPassword);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
    expect(insertBody).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('rejects a bad role with 400 and no insert', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set(bearer(adminToken))
      .send({ ...validBody, role: 'superuser' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/role/i);
    expect(insertBody).toBeNull();
  });

  it('rejects a bad email with 400 and no insert', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set(bearer(adminToken))
      .send({ ...validBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
    expect(insertBody).toBeNull();
  });

  it('rejects a missing / non-existent organisation with 400 and no insert', async () => {
    orgLookupRow = null; // the org validation lookup finds nothing
    const res = await request(app)
      .post('/api/staff')
      .set(bearer(adminToken))
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/organisation/i);
    expect(insertBody).toBeNull();
  });

  it('maps a duplicate email (Postgres 23505) to a 400', async () => {
    mutatedRow = safeStaff;
    insertError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    };
    const res = await request(app)
      .post('/api/staff')
      .set(bearer(adminToken))
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already registered/i);
  });
});

describe('PUT /api/staff/:id — admin update', () => {
  it('rejects an officer token with 403', async () => {
    const res = await request(app)
      .put('/api/staff/staff-uuid-1')
      .set(bearer(officerToken))
      .send({ name: 'New Name' });
    expect(res.status).toBe(403);
  });

  it('rehashes a supplied password on update (stores a new hash, not the plaintext)', async () => {
    mutatedRow = safeStaff;
    const res = await request(app)
      .put('/api/staff/staff-uuid-1')
      .set(bearer(adminToken))
      .send({ password: 'BrandNewPass9' });

    expect(res.status).toBe(200);
    expect(updateBody.password_hash).toBeTruthy();
    expect(updateBody.password_hash).not.toBe('BrandNewPass9');
    expect(bcrypt.compareSync('BrandNewPass9', updateBody.password_hash)).toBe(true);
    expect(updateBody).not.toHaveProperty('password');

    const audit = auditBodies.find((a) => a.action === 'staff_updated');
    expect(audit).toBeTruthy();
    expect(audit.detail).toEqual({ staff_id: 'staff-uuid-1', role: 'officer' });
  });

  it('leaves the password unchanged when the field is omitted (no password_hash in the patch)', async () => {
    mutatedRow = safeStaff;
    const res = await request(app)
      .put('/api/staff/staff-uuid-1')
      .set(bearer(adminToken))
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(updateBody.name).toBe('Renamed');
    expect(updateBody).not.toHaveProperty('password_hash');
  });

  it('rejects a bad role on update with 400', async () => {
    const res = await request(app)
      .put('/api/staff/staff-uuid-1')
      .set(bearer(adminToken))
      .send({ role: 'wizard' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/role/i);
    expect(updateBody).toBeNull();
  });

  it('rejects a bad email on update with 400', async () => {
    const res = await request(app)
      .put('/api/staff/staff-uuid-1')
      .set(bearer(adminToken))
      .send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
    expect(updateBody).toBeNull();
  });

  it('maps a duplicate email on update (23505) to a 400', async () => {
    mutatedRow = safeStaff;
    updateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    };
    const res = await request(app)
      .put('/api/staff/staff-uuid-1')
      .set(bearer(adminToken))
      .send({ email: 'taken@justicenow.local' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already registered/i);
  });

  it('returns 404 when the staff member does not exist', async () => {
    mutatedRow = null; // update().select().maybeSingle() → null
    const res = await request(app)
      .put('/api/staff/missing')
      .set(bearer(adminToken))
      .send({ name: 'X' });
    expect(res.status).toBe(404);
    expect(auditBodies).toHaveLength(0);
  });
});

describe('DELETE /api/staff/:id — admin SOFT delete', () => {
  it('rejects an officer token with 403', async () => {
    const res = await request(app)
      .delete('/api/staff/staff-uuid-1')
      .set(bearer(officerToken));
    expect(res.status).toBe(403);
  });

  it('SOFT-deletes (PATCH is_active=false, no DB DELETE) and writes staff_deleted', async () => {
    // Target is a non-admin, so no last-admin guard applies.
    targetStaffRow = { id: 'staff-uuid-1', role: 'officer', is_active: true };
    mutatedRow = { ...safeStaff, is_active: false };

    const res = await request(app)
      .delete('/api/staff/staff-uuid-1')
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.is_active).toBe(false);

    // The deactivation is an UPDATE setting is_active=false — NOT a DB DELETE.
    expect(updateMethod).toBe('PATCH');
    expect(updateBody).toEqual({ is_active: false });
    expect(sawStaffDbDelete).toBe(false);

    const audit = auditBodies.find((a) => a.action === 'staff_deleted');
    expect(audit).toBeTruthy();
    expect(audit.detail).toEqual({ staff_id: safeStaff.id, role: safeStaff.role });
  });

  it('refuses to deactivate the caller’s OWN account with 400 (self-lockout guard)', async () => {
    // The admin token's sub is 'staff-admin'; deactivating that same id must 400
    // BEFORE any DB write or audit.
    const res = await request(app)
      .delete('/api/staff/staff-admin')
      .set(bearer(adminToken));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/your own account/i);
    expect(updateMethod).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('refuses to deactivate the LAST active admin with 400', async () => {
    targetStaffRow = { id: 'other-admin', role: 'admin', is_active: true };
    adminCount = 1; // this is the only active admin left
    const res = await request(app)
      .delete('/api/staff/other-admin')
      .set(bearer(adminToken));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/last active admin/i);
    expect(updateMethod).toBeNull();
    expect(auditBodies).toHaveLength(0);
  });

  it('allows deactivating an admin when another active admin remains', async () => {
    targetStaffRow = { id: 'other-admin', role: 'admin', is_active: true };
    adminCount = 3;
    mutatedRow = { ...safeStaff, id: 'other-admin', role: 'admin', is_active: false };
    const res = await request(app)
      .delete('/api/staff/other-admin')
      .set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(updateBody).toEqual({ is_active: false });
  });

  it('returns 404 when the staff member does not exist (no audit)', async () => {
    targetStaffRow = null; // the target lookup finds nothing
    const res = await request(app).delete('/api/staff/missing').set(bearer(adminToken));
    expect(res.status).toBe(404);
    expect(sawStaffDbDelete).toBe(false);
    expect(auditBodies).toHaveLength(0);
  });
});
