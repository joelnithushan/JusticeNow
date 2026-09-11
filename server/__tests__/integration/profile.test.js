/**
 * Integration tests — self-service staff profile under /api/staff/me.
 *
 * Follows the repo fetch-stub pattern (see caseDetail.test.js / staffAdmin.test.js):
 * we do NOT hit a real database. We stub the global fetch the Supabase client
 * uses and hand back canned PostgREST responses; the stub is installed BEFORE
 * the app is imported, because the app builds its Supabase client at import time.
 * Guarded routes are exercised with REAL JWTs signed with process.env.JWT_SECRET
 * (the same secret services/auth.js verifies) — crucially carrying the `method`
 * claim, which drives auth_method on GET and the password-change gate.
 *
 * We use REAL bcryptjs so the change-password assertions are meaningful (the
 * stored current-password hash is compared for real).
 *
 * What we pin down here:
 *  - GET /me returns the profile shape, NEVER password_hash, and surfaces
 *    auth_method from the token's method claim; 401 without a token.
 *  - PATCH /me derives gender + date_of_birth server-side from a VALID NIC (and
 *    the update body sent to Supabase carries them); rejects an INVALID NIC
 *    (Feb-29 non-leap) and an invalid phone with 400; and computes
 *    profile_completed = true only when all required fields are present
 *    (including bar_number for an attorney token), false otherwise.
 *  - POST /me/password is refused (400) for a google-method token; for a
 *    password token a wrong current password → 400 and a correct one → success.
 *
 * AVATAR NOTE (skipped deliberately, not faked): POST /me/avatar streams to
 * Supabase Storage via supabase.storage.from().upload(), whose REST shape is not
 * cleanly reproducible with the fetch-stub style used across this suite (it is
 * the same reason caseDetail.test.js leaves the Storage signed-URL branch to a
 * follow-up). Rather than fake a pass, the avatar upload is left uncovered here
 * and should be unit-tested against a mocked supabase.storage in a follow-up.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// A real bcrypt hash of a known current password, so changeOwnPassword's compare
// runs for real (cost 4 keeps the test fast; the value is irrelevant to bcrypt).
const CURRENT_PASSWORD = 'CurrentPass-2026';
const CURRENT_HASH = bcrypt.hashSync(CURRENT_PASSWORD, 4);

// Test doubles the fetch stub returns / captures, reset per-test.
let staffRow = null; // the staff_users row loadOwnRow / password-lookup returns
let orgRow = null; // the organisations row loadOwnRow resolves for the org name
let updateBody = null; // captures the staff_users PATCH body (the derived fields live here)
let updatedRow = null; // the row the staff_users PATCH .select().maybeSingle() returns
let passwordUpdateBody = null; // captures a password PATCH body (password_hash only)
let passwordUpdated = false; // set when the password PATCH ran

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  // audit_log inserts (best-effort staff_updated) — swallow.
  if (method === 'POST' && target.includes('/rest/v1/audit_log')) {
    return json([], 201);
  }

  // organisations — loadOwnRow resolves the org name (id=eq.<id>.maybeSingle()).
  if (target.includes('/rest/v1/organisations')) {
    return json(orgRow);
  }

  // staff_users
  if (target.includes('/rest/v1/staff_users')) {
    if (method === 'PATCH') {
      const parsed = options.body ? JSON.parse(options.body) : null;
      // The change-password path selects only password_hash; a profile PATCH
      // selects the full PROFILE_COLUMNS. Distinguish by what the patch touches.
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'password_hash')) {
        passwordUpdateBody = parsed;
        passwordUpdated = true;
        return json([], 200); // .update(...).eq(...) with no .select() → no row
      }
      updateBody = parsed;
      // update().select(PROFILE_COLUMNS).maybeSingle() → the updated row (or null)
      return json(updatedRow);
    }
    // GET: the loadOwnRow / password-lookup select → object or null.
    return json(staffRow);
  }

  return json([], 200);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

// Real tokens carrying the `method` claim (the new thing profile logic reads).
const passwordOfficerToken = jwt.sign(
  { sub: 'staff-officer', role: 'officer', org: 'org-1', method: 'password' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);
const googleOfficerToken = jwt.sign(
  { sub: 'staff-officer', role: 'officer', org: 'org-1', method: 'google' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);
const passwordAttorneyToken = jwt.sign(
  { sub: 'staff-attorney', role: 'attorney', org: 'org-1', method: 'password' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// A staff_users row as PROFILE_COLUMNS returns it — note: NO password_hash.
const baseProfileRow = {
  id: 'staff-officer',
  name: 'Officer One',
  email: 'officer@justicenow.local',
  role: 'officer',
  organisation_id: 'org-1',
  nic: null,
  phone: null,
  designation: null,
  bar_number: null,
  gender: null,
  date_of_birth: null,
  avatar_path: null,
  profile_completed: false,
};

beforeEach(() => {
  staffRow = null;
  orgRow = { name: 'JusticeNow Dev Legal Aid' };
  updateBody = null;
  updatedRow = null;
  passwordUpdateBody = null;
  passwordUpdated = false;
  fetchMock.mockClear();
});

describe('GET /api/staff/me', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/staff/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns the profile shape, never password_hash, and surfaces auth_method from the token', async () => {
    staffRow = { ...baseProfileRow };

    const res = await request(app).get('/api/staff/me').set(bearer(passwordOfficerToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;

    // Core profile fields present and org name resolved.
    expect(data.id).toBe('staff-officer');
    expect(data.email).toBe('officer@justicenow.local');
    expect(data.organisation_name).toBe('JusticeNow Dev Legal Aid');

    // auth_method comes straight from the token's `method` claim.
    expect(data.auth_method).toBe('password');

    // The password hash must NEVER leave the server — not in data, not anywhere.
    expect(data).not.toHaveProperty('password_hash');
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
  });

  it('reflects a google-method token as auth_method "google"', async () => {
    staffRow = { ...baseProfileRow };
    const res = await request(app).get('/api/staff/me').set(bearer(googleOfficerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.auth_method).toBe('google');
  });
});

describe('PATCH /api/staff/me — NIC derivation + validation', () => {
  it('accepts a valid NIC and stores server-DERIVED gender + date_of_birth', async () => {
    // Current row is empty; the PATCH supplies a valid new-format NIC. The
    // service must decode it and put gender + date_of_birth in the UPDATE body —
    // never trusting a client-sent gender/dob (the NIC is the authority).
    staffRow = { ...baseProfileRow };
    updatedRow = { ...baseProfileRow, nic: '199010012345', gender: 'male', date_of_birth: '1990-04-09' };

    const res = await request(app)
      .patch('/api/staff/me')
      .set(bearer(passwordOfficerToken))
      .send({ nic: '199010012345' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // The outgoing update body carries the DERIVED fields. Year 1990, day-of-year
    // 100 → April 9; male because the day field (≤ 500) has no female +500 offset.
    expect(updateBody.nic).toBe('199010012345');
    expect(updateBody.gender).toBe('male');
    expect(updateBody.date_of_birth).toBe('1990-04-09');
  });

  it('rejects an INVALID NIC (Feb-29 in a non-leap year) with 400 and no write', async () => {
    // 2001 is NOT a leap year; day-of-year 060 maps to Feb 29, which is invalid.
    staffRow = { ...baseProfileRow };

    const res = await request(app)
      .patch('/api/staff/me')
      .set(bearer(passwordOfficerToken))
      .send({ nic: '200106012345' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // Nothing was written when validation failed.
    expect(updateBody).toBeNull();
  });

  it('rejects an invalid phone with 400 and no write', async () => {
    staffRow = { ...baseProfileRow };

    const res = await request(app)
      .patch('/api/staff/me')
      .set(bearer(passwordOfficerToken))
      .send({ phone: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(updateBody).toBeNull();
  });
});

describe('PATCH /api/staff/me — profile_completed computation', () => {
  it('sets profile_completed true when name+nic+phone+designation are all present (officer)', async () => {
    // The existing row already has name; the patch supplies the remaining three.
    staffRow = { ...baseProfileRow, name: 'Officer One' };
    updatedRow = { ...baseProfileRow, profile_completed: true };

    const res = await request(app)
      .patch('/api/staff/me')
      .set(bearer(passwordOfficerToken))
      .send({ nic: '199010012345', phone: '0712345678', designation: 'Advocacy Officer' });

    expect(res.status).toBe(200);
    // For a NON-attorney, bar_number is NOT required, so all four core fields
    // present ⇒ completed.
    expect(updateBody.profile_completed).toBe(true);
  });

  it('leaves profile_completed false when a required field is still missing', async () => {
    // No designation anywhere (neither on the row nor in the patch) ⇒ incomplete.
    staffRow = { ...baseProfileRow, name: 'Officer One', phone: '0712345678' };
    updatedRow = { ...baseProfileRow, profile_completed: false };

    const res = await request(app)
      .patch('/api/staff/me')
      .set(bearer(passwordOfficerToken))
      .send({ nic: '199010012345' });

    expect(res.status).toBe(200);
    expect(updateBody.profile_completed).toBe(false);
  });

  it('requires bar_number for an attorney before profile_completed is true', async () => {
    // Attorney with the four core fields but NO bar_number → still incomplete.
    staffRow = {
      ...baseProfileRow,
      id: 'staff-attorney',
      role: 'attorney',
      name: 'Attorney One',
      phone: '0712345678',
      designation: 'Legal Aid Attorney',
    };
    updatedRow = { ...baseProfileRow, profile_completed: false };

    const withoutBar = await request(app)
      .patch('/api/staff/me')
      .set(bearer(passwordAttorneyToken))
      .send({ nic: '199010012345' });

    expect(withoutBar.status).toBe(200);
    expect(updateBody.profile_completed).toBe(false);

    // Now supply the bar_number too → all attorney requirements met ⇒ completed.
    updateBody = null;
    updatedRow = { ...baseProfileRow, profile_completed: true };
    const withBar = await request(app)
      .patch('/api/staff/me')
      .set(bearer(passwordAttorneyToken))
      .send({ nic: '199010012345', bar_number: 'BAR-4521' });

    expect(withBar.status).toBe(200);
    expect(updateBody.bar_number).toBe('BAR-4521');
    expect(updateBody.profile_completed).toBe(true);
  });
});

describe('POST /api/staff/me/password', () => {
  it('is refused (400) for a google-method session before any DB touch', async () => {
    // A Google session has no password_hash to verify against, so the change is
    // refused server-side regardless of what the client shows.
    const res = await request(app)
      .post('/api/staff/me/password')
      .set(bearer(googleOfficerToken))
      .send({ current_password: 'anything', new_password: 'NewPassword-9' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // No password write happened.
    expect(passwordUpdated).toBe(false);
  });

  it('rejects a wrong current password with 400 (no write)', async () => {
    staffRow = { id: 'staff-officer', password_hash: CURRENT_HASH };

    const res = await request(app)
      .post('/api/staff/me/password')
      .set(bearer(passwordOfficerToken))
      .send({ current_password: 'not-the-current-one', new_password: 'NewPassword-9' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(passwordUpdated).toBe(false);
  });

  it('changes the password when the current one is correct, storing a fresh bcrypt hash', async () => {
    staffRow = { id: 'staff-officer', password_hash: CURRENT_HASH };

    const res = await request(app)
      .post('/api/staff/me/password')
      .set(bearer(passwordOfficerToken))
      .send({ current_password: CURRENT_PASSWORD, new_password: 'BrandNewPass-9' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // A genuine bcrypt hash of the NEW password was stored — never the plaintext.
    expect(passwordUpdated).toBe(true);
    expect(passwordUpdateBody.password_hash).toBeTruthy();
    expect(passwordUpdateBody.password_hash).not.toBe('BrandNewPass-9');
    expect(bcrypt.compareSync('BrandNewPass-9', passwordUpdateBody.password_hash)).toBe(true);
    // The response must never carry a password/hash.
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
  });
});
