/**
 * Integration tests — staff two-factor auth (TOTP) HTTP flow.
 *
 * Follows the repo fetch-stub pattern (see login.test.js / staffAdmin.test.js /
 * profile.test.js): we do NOT hit a real database. We stub the global fetch the
 * Supabase client uses and hand back canned PostgREST responses; the stub is
 * installed BEFORE the app is imported, because the app builds its Supabase
 * client at import time. Guarded /me and /:id routes are exercised with REAL JWTs
 * signed with process.env.JWT_SECRET (the same secret services/auth.js verifies).
 *
 * We use REAL otplib to mint live TOTP codes and REAL bcryptjs so the code /
 * backup-code checks run for real.
 *
 * What we pin down:
 *  - POST /login with an mfa_enabled account → an mfa_required + mfa_token
 *    response ONLY (no token/staff, no staff_login audit yet).
 *  - POST /login with mfa_enabled=false → the unchanged { token, staff } (guard
 *    against a regression that would 2FA-gate every account).
 *  - POST /login/mfa: valid token + live TOTP → { token, staff }; valid token +
 *    wrong code → 401 INVALID_MFA_MESSAGE; valid token + backup code → { token }
 *    AND the consumed hash is removed via an update; garbage/expired token →
 *    401 session-expired; missing token or code → 400.
 *  - The /login/mfa throttle returns 429 once the shared per-IP cap is crossed.
 *  - POST /me/mfa/activate (requireStaff): correct code → data.backup_codes of
 *    length 8; wrong code → 400 INVALID_MFA_MESSAGE.
 *  - POST /:id/mfa/reset: officer → 403; admin → 200 and issues the reset update
 *    (mfa_enabled=false, totp_secret=null).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// A shared TOTP secret + a real bcrypt hash of a known login password. Cost 4
// keeps the bcrypt work fast; the value is irrelevant to correctness.
const TOTP_SECRET = authenticator.generateSecret();
const LOGIN_PASSWORD = 'CorrectHorse-2026';
const PASSWORD_HASH = bcrypt.hashSync(LOGIN_PASSWORD, 4);

// Test doubles the fetch stub returns / captures, reset per-test.
// loginRow: the staff_users row resolved by email during authenticateStaff.
// idRow: the staff_users row resolved by id during completeMfaLogin / activate.
let loginRow = null;
let idRow = null;
let staffUpdateBody = null; // captures a staff_users PATCH body (backup-code / reset write)
let staffUpdated = false; // set when a staff_users PATCH ran
let auditActions = []; // every audit_log insert's `action`

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  // audit_log inserts (best-effort staff_login / staff_updated) — capture action.
  if (method === 'POST' && target.includes('/rest/v1/audit_log')) {
    const parsed = options.body ? JSON.parse(options.body) : null;
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (row && row.action) auditActions.push(row.action);
    return json([], 201);
  }

  // staff_users
  if (target.includes('/rest/v1/staff_users')) {
    if (method === 'PATCH') {
      staffUpdated = true;
      staffUpdateBody = options.body ? JSON.parse(options.body) : null;
      // activateMfa's update chains .eq() with no .select() → no row expected.
      return json([], 200);
    }
    // GET: authenticateStaff looks up by email; completeMfaLogin / activateMfa
    // look up by id. Distinguish on the filter in the URL.
    if (target.includes('email=eq.')) {
      return json(loginRow);
    }
    return json(idRow);
  }

  return json([], 200);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');
const { INVALID_MFA_MESSAGE } = await import('../../services/mfa.js');

// Real tokens signed with the same secret services/auth.js verifies against.
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const officerToken = jwt.sign(
  { sub: 'staff-officer', role: 'officer', org: 'org-1', method: 'password' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);
const adminToken = jwt.sign(
  { sub: 'staff-admin', role: 'admin', org: 'org-1', method: 'password' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' },
);

// A signed pending-MFA token, as signMfaToken mints after a correct password.
const pendingMfaToken = (sub = 'staff-mfa') =>
  jwt.sign({ sub, mfa: 'pending' }, process.env.JWT_SECRET, { expiresIn: '5m' });

// The full staff_users row completeMfaLogin selects by id.
const mfaStaffRow = {
  id: 'staff-mfa',
  name: 'MFA User',
  email: 'mfa@justicenow.local',
  role: 'officer',
  organisation_id: 'org-1',
  is_active: true,
  mfa_enabled: true,
  totp_secret: TOTP_SECRET,
  mfa_backup_codes: [],
};

beforeEach(() => {
  loginRow = null;
  idRow = null;
  staffUpdateBody = null;
  staffUpdated = false;
  auditActions = [];
  fetchMock.mockClear();
});

describe('POST /api/staff/login — MFA-enabled account', () => {
  it('returns mfa_required + a pending mfa_token ONLY (no token/staff, no audit yet)', async () => {
    loginRow = {
      id: 'staff-mfa',
      name: 'MFA User',
      email: 'mfa@justicenow.local',
      role: 'officer',
      organisation_id: 'org-1',
      password_hash: PASSWORD_HASH,
      is_active: true,
      mfa_enabled: true,
    };

    const res = await request(app)
      .post('/api/staff/login')
      .send({ email: 'mfa@justicenow.local', password: LOGIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mfa_required).toBe(true);
    expect(typeof res.body.data.mfa_token).toBe('string');
    // The pending token is real and carries mfa:'pending' + the staff id.
    const decoded = jwt.verify(res.body.data.mfa_token, process.env.JWT_SECRET);
    expect(decoded.mfa).toBe('pending');
    expect(decoded.sub).toBe('staff-mfa');

    // The password alone is NOT a session: no full JWT / staff profile leaks.
    expect(res.body.data).not.toHaveProperty('token');
    expect(res.body.data).not.toHaveProperty('staff');
    // And the login is not complete, so no staff_login audit fires yet.
    expect(auditActions).not.toContain('staff_login');
  });
});

describe('POST /api/staff/login — MFA disabled (regression guard)', () => {
  it('returns the unchanged { token, staff } when mfa_enabled is false', async () => {
    loginRow = {
      id: 'staff-plain',
      name: 'Plain User',
      email: 'plain@justicenow.local',
      role: 'officer',
      organisation_id: 'org-1',
      password_hash: PASSWORD_HASH,
      is_active: true,
      mfa_enabled: false,
    };

    const res = await request(app)
      .post('/api/staff/login')
      .send({ email: 'plain@justicenow.local', password: LOGIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.staff).toMatchObject({
      id: 'staff-plain',
      email: 'plain@justicenow.local',
      role: 'officer',
    });
    // No 2FA gate for this account → no pending-MFA handshake.
    expect(res.body.data).not.toHaveProperty('mfa_required');
    expect(res.body.data).not.toHaveProperty('mfa_token');
    // A completed login writes the staff_login audit.
    expect(auditActions).toContain('staff_login');
  });
});

describe('POST /api/staff/login/mfa — second factor', () => {
  it('exchanges a valid token + live TOTP code for { token, staff }', async () => {
    idRow = { ...mfaStaffRow };
    const code = authenticator.generate(TOTP_SECRET);

    const res = await request(app)
      .post('/api/staff/login/mfa')
      .send({ mfa_token: pendingMfaToken(), code });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.staff).toMatchObject({
      id: 'staff-mfa',
      email: 'mfa@justicenow.local',
      role: 'officer',
    });
    // The minted session JWT is a full 'password'-method token (not pending).
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(decoded.sub).toBe('staff-mfa');
    expect(decoded.method).toBe('password');
    expect(decoded.mfa).toBeUndefined();
    // Now the login is complete → the staff_login audit fires.
    expect(auditActions).toContain('staff_login');
  });

  it('rejects a valid token but wrong code with 401 INVALID_MFA_MESSAGE', async () => {
    idRow = { ...mfaStaffRow };
    // A syntactically valid 6-digit code that is not the live one.
    const live = authenticator.generate(TOTP_SECRET);
    const wrong = live === '000000' ? '111111' : '000000';

    const res = await request(app)
      .post('/api/staff/login/mfa')
      .send({ mfa_token: pendingMfaToken(), code: wrong });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe(INVALID_MFA_MESSAGE);
    // A failed second factor is not a session.
    expect(res.body.data).toBeUndefined();
  });

  it('accepts a valid single-use backup code and removes the consumed hash via an update', async () => {
    const plainBackup = 'ABCDE-12345';
    idRow = {
      ...mfaStaffRow,
      // A wrong secret so the TOTP branch fails and the backup-code path runs.
      totp_secret: TOTP_SECRET,
      mfa_backup_codes: [
        bcrypt.hashSync(plainBackup, 4),
        bcrypt.hashSync('OTHER-CODE9', 4),
      ],
    };

    const res = await request(app)
      .post('/api/staff/login/mfa')
      // Submit the backup code (not a TOTP code) — verifyTotp fails, then the
      // backup-code fallback consumes it.
      .send({ mfa_token: pendingMfaToken(), code: plainBackup });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');

    // The consumed hash is dropped: the update that persists `remaining` ran, and
    // the used code no longer matches any hash left in the stored array.
    expect(staffUpdated).toBe(true);
    expect(Array.isArray(staffUpdateBody.mfa_backup_codes)).toBe(true);
    expect(staffUpdateBody.mfa_backup_codes).toHaveLength(1);
    expect(bcrypt.compareSync(plainBackup, staffUpdateBody.mfa_backup_codes[0])).toBe(false);
  });

  it('rejects a garbage / expired mfa_token with a 401 session-expired message', async () => {
    idRow = { ...mfaStaffRow };

    const res = await request(app)
      .post('/api/staff/login/mfa')
      .send({ mfa_token: 'not-a-real-jwt', code: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/session expired/i);
  });

  it('returns 400 when the code is missing', async () => {
    const res = await request(app)
      .post('/api/staff/login/mfa')
      .send({ mfa_token: pendingMfaToken() });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when the mfa_token is missing', async () => {
    const res = await request(app)
      .post('/api/staff/login/mfa')
      .send({ code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/staff/login/mfa — rate limiting', () => {
  it('returns 429 once the shared per-IP login threshold is exceeded', async () => {
    idRow = { ...mfaStaffRow };
    // The default cap is 10 attempts / window, shared with /login per IP. Fire
    // well past it (all wrong codes → genuine 401s until the limiter trips).
    let last;
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop -- must be sequential to trip
      last = await request(app)
        .post('/api/staff/login/mfa')
        .send({ mfa_token: pendingMfaToken(), code: '000000' });
    }
    expect(last.status).toBe(429);
    expect(last.body.success).toBe(false);
    expect(last.body.message).toBe('Too many attempts. Please wait and try again.');
  });
});

describe('POST /api/staff/me/mfa/activate — finish enrollment', () => {
  it('returns 8 one-time backup codes for a correct code against the pending secret', async () => {
    // The pending secret was stored during setup; activateMfa reads it by id.
    idRow = { totp_secret: TOTP_SECRET, mfa_enabled: false };
    const code = authenticator.generate(TOTP_SECRET);

    const res = await request(app)
      .post('/api/staff/me/mfa/activate')
      .set(bearer(officerToken))
      .send({ code });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.backup_codes)).toBe(true);
    expect(res.body.data.backup_codes).toHaveLength(8);
    // Enrollment flipped mfa_enabled on and stored HASHED backup codes (never the
    // plaintext) in the same update.
    expect(staffUpdated).toBe(true);
    expect(staffUpdateBody.mfa_enabled).toBe(true);
    expect(Array.isArray(staffUpdateBody.mfa_backup_codes)).toBe(true);
    for (const plain of res.body.data.backup_codes) {
      expect(staffUpdateBody.mfa_backup_codes).not.toContain(plain);
    }
  });

  it('rejects a wrong code with 400 INVALID_MFA_MESSAGE and no enable', async () => {
    idRow = { totp_secret: TOTP_SECRET, mfa_enabled: false };
    const live = authenticator.generate(TOTP_SECRET);
    const wrong = live === '000000' ? '111111' : '000000';

    const res = await request(app)
      .post('/api/staff/me/mfa/activate')
      .set(bearer(officerToken))
      .send({ code: wrong });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe(INVALID_MFA_MESSAGE);
    // A failed verify must not enable 2FA.
    expect(staffUpdated).toBe(false);
  });
});

describe('POST /api/staff/:id/mfa/reset — admin only', () => {
  it('forbids a plain officer with 403 and issues no reset', async () => {
    const res = await request(app)
      .post('/api/staff/staff-mfa/mfa/reset')
      .set(bearer(officerToken));

    expect(res.status).toBe(403);
    expect(staffUpdated).toBe(false);
  });

  it('lets an admin reset: 200 and an update setting mfa_enabled=false, totp_secret=null', async () => {
    const res = await request(app)
      .post('/api/staff/staff-mfa/mfa/reset')
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The reset wipes the second factor so the target must re-enroll.
    expect(staffUpdated).toBe(true);
    expect(staffUpdateBody.mfa_enabled).toBe(false);
    expect(staffUpdateBody.totp_secret).toBeNull();
    expect(staffUpdateBody.mfa_backup_codes).toEqual([]);
  });
});
