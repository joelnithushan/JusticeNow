/**
 * Unit tests — staff authentication service.
 *
 * Following the repo's pattern (see integration/reports.test.js) we stub the
 * global fetch that Supabase uses rather than mocking the module. We use REAL
 * bcryptjs with a real hash so the compare path is genuinely exercised. The
 * fetch stub and JWT_SECRET must be set before the service is imported.
 *
 * The critical security property under test: authenticateStaff returns an
 * IDENTICAL error for unknown-email and wrong-password, so the login cannot be
 * used to enumerate which staff emails exist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

// services/auth.js pulls bcryptjs via CommonJS `require`. To PROVE the timing-
// equalisation compare runs, we spy on the SAME bcryptjs instance the service
// uses — the CJS singleton — reached here through createRequire. (A plain ESM
// `import bcrypt from 'bcryptjs'` yields a DIFFERENT object across the CJS/ESM
// boundary in the test runner, and even vi.mock only intercepts the ESM import,
// not the service's require — so spying on the CJS singleton is what actually
// observes the service's call.) We wrap, not replace, so the real KDF still runs
// and timing stays genuine.
const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const compareSpy = vi.spyOn(bcrypt, 'compare');

// Must be set before importing the service (it throws at import if missing).
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';

// A real bcrypt hash of the known-correct password. Using the real hash means
// bcrypt.compare runs for real, so the "wrong password" path is genuine.
const CORRECT_PASSWORD = 'CorrectHorse-2026';
const PASSWORD_HASH = bcrypt.hashSync(CORRECT_PASSWORD, 4);

// The staff row the fake DB returns, or null to simulate "no such user".
let staffRow = null;

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  // A staff lookup is a GET to /rest/v1/staff_users. maybeSingle() sets the
  // pgrst single-object Accept header; returning the object (or null) works.
  if ((options.method || 'GET') === 'GET' && target.includes('/rest/v1/staff_users')) {
    return new Response(JSON.stringify(staffRow), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('[]', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const {
  authenticateStaff,
  signToken,
  verifyToken,
  INVALID_CREDENTIALS_MESSAGE,
  DUMMY_PASSWORD_HASH,
} = await import('../../services/auth.js');

const staffFixture = {
  id: 'staff-1',
  name: 'Dev Admin',
  email: 'admin@justicenow.local',
  role: 'admin',
  organisation_id: 'org-1',
  password_hash: PASSWORD_HASH,
  is_active: true,
};

beforeEach(() => {
  staffRow = null;
  fetchMock.mockClear();
  compareSpy.mockClear();
});

describe('signToken / verifyToken', () => {
  it('round-trips the staff claims through a signed token', () => {
    const token = signToken({ id: 'staff-1', role: 'admin', organisation_id: 'org-1' });
    const decoded = verifyToken(token);

    expect(decoded.sub).toBe('staff-1');
    expect(decoded.role).toBe('admin');
    expect(decoded.org).toBe('org-1');
  });

  it('rejects a tampered token', () => {
    const token = signToken({
      id: 'staff-1',
      role: 'officer',
      organisation_id: 'org-1',
    });
    // Flip the last character of the signature to simulate tampering.
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');

    expect(() => verifyToken(tampered)).toThrow();
  });
});

describe('authenticateStaff — no login oracle', () => {
  it('returns the SAME error for an unknown email as for a wrong password', async () => {
    // Case 1: unknown email -> lookup returns null.
    staffRow = null;
    let unknownEmailError;
    try {
      await authenticateStaff('nobody@justicenow.local', 'whatever');
    } catch (err) {
      unknownEmailError = err;
    }

    // Case 2: known email, wrong password -> row found, bcrypt.compare false.
    staffRow = staffFixture;
    let wrongPasswordError;
    try {
      await authenticateStaff('admin@justicenow.local', 'wrong-password');
    } catch (err) {
      wrongPasswordError = err;
    }

    expect(unknownEmailError.status).toBe(401);
    expect(wrongPasswordError.status).toBe(401);
    expect(unknownEmailError.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(wrongPasswordError.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(unknownEmailError.message).toBe(wrongPasswordError.message);
  });

  it('runs a throwaway bcrypt.compare against the dummy hash when the email is unknown (equalises timing)', async () => {
    // No such user → the lookup returns null. To close the TIMING side-channel,
    // authenticateStaff must still pay the cost of a bcrypt.compare (against the
    // fixed DUMMY_PASSWORD_HASH) before throwing, so an unknown-email response is
    // not measurably faster than a wrong-password one. We spy on bcrypt.compare
    // to prove that dummy-compare path actually runs against THAT hash.
    staffRow = null;

    let unknownEmailError;
    try {
      await authenticateStaff('nobody@justicenow.local', 'whatever');
    } catch (err) {
      unknownEmailError = err;
    }

    // The compare ran against the dummy hash (never a real password_hash, since
    // there is no row) — with the submitted password as the plaintext.
    expect(compareSpy).toHaveBeenCalledWith('whatever', DUMMY_PASSWORD_HASH);
    // And the outcome is still the SAME generic 401 (no oracle in the message).
    expect(unknownEmailError.status).toBe(401);
    expect(unknownEmailError.message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('rejects a DEACTIVATED account with the identical INVALID_CREDENTIALS error (no oracle)', async () => {
    // A deactivated staff member, with the CORRECT password, must fail login
    // with the SAME generic 401 as a wrong password — a distinct "disabled"
    // message would be a login oracle (confirming the email exists / the
    // password was right). See services/auth.js.
    staffRow = { ...staffFixture, is_active: false };

    let inactiveError;
    try {
      await authenticateStaff('admin@justicenow.local', CORRECT_PASSWORD);
    } catch (err) {
      inactiveError = err;
    }

    expect(inactiveError).toBeTruthy();
    expect(inactiveError.status).toBe(401);
    expect(inactiveError.message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('returns a token and safe staff object on a correct password', async () => {
    staffRow = staffFixture;

    const result = await authenticateStaff('admin@justicenow.local', CORRECT_PASSWORD);

    expect(result.token).toBeTruthy();
    expect(result.staff).toEqual({
      id: 'staff-1',
      name: 'Dev Admin',
      email: 'admin@justicenow.local',
      role: 'admin',
      organisation_id: 'org-1',
    });
    // The password hash must never be handed back to the caller.
    expect(result.staff).not.toHaveProperty('password_hash');

    const decoded = verifyToken(result.token);
    expect(decoded.sub).toBe('staff-1');
    expect(decoded.role).toBe('admin');
    expect(decoded.org).toBe('org-1');
  });
});
