/**
 * JusticeNow — Staff authentication service.
 *
 * ONLY staff (attorney/officer/admin) ever authenticate — reporters never do.
 * This module owns the two sensitive operations: verifying a login and
 * minting/checking the JWT that a staff session carries.
 *
 * PRIVACY: never log the email, password, token, or password_hash. A failed
 * login must give an IDENTICAL error for "no such user" and "wrong password"
 * so the endpoint cannot be used to enumerate which emails exist.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

// Read the signing secret at import time and fail loudly if it is missing,
// exactly like config/supabase.js does for its credentials. A server that
// starts without a real secret would silently issue forgeable tokens.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'Missing JWT_SECRET: it must be set in server/.env.\n' +
      'Copy server/.env.example to server/.env and set a strong random value. ' +
      'Without it, staff session tokens cannot be signed or verified.',
  );
}

// Sessions are short-lived: staff re-login on the client is cheap, and a
// leaked token stops being useful quickly.
const TOKEN_TTL = '8h';

// Same message for unknown-email and wrong-password — no login oracle.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

// A fixed, real bcrypt hash used ONLY to burn the same CPU time as a genuine
// password check when NO user is found. WHY: bcrypt.compare against a real hash
// is deliberately slow; if we skipped it for an unknown email, that request
// would return measurably FASTER than a wrong-password request (which does run
// the compare). That timing gap is a side-channel oracle — it leaks which
// emails exist. Running a throwaway compare against this constant equalises the
// timing so unknown-email and wrong-password are indistinguishable by the clock
// as well as by the message. The value is a genuine bcrypt hash (cost 10, the
// app's BCRYPT_COST) of a random string nobody can supply; it must be a WELL-
// FORMED hash so bcrypt actually runs the KDF (a malformed hash would short-
// circuit and defeat the timing equalisation). It is not a credential and
// matches nothing.
const DUMMY_PASSWORD_HASH =
  '$2b$10$xRNuw5XMEj4ycKlVeKv0y.P0RdhHFrCrQQnQsiK6ZuRvkg9Wf/2j2';

// Shown when a Google-authenticated person is not a provisioned staff member.
// This is NOT a login oracle: the caller has already proven (via Google) that
// they own THIS account, so telling them they are not staff reveals nothing
// about any other email. Staff are admin-provisioned in staff_users; Google
// sign-in can never self-register a new staff account.
const NOT_STAFF_MESSAGE = 'This Google account is not a registered staff member.';

/**
 * Sign a JWT for an authenticated staff member.
 *
 * @param {{ id: string, role: string, organisation_id: string }} staff
 * @param {'password'|'google'} [method]  which credential proved this session.
 *        Carried as a `method` claim so /me can refuse a password change for a
 *        Google account (which has no password_hash to verify against). Defaults
 *        to 'password' for backward-compat with tokens minted before this claim.
 * @returns {string} a signed JWT
 */
function signToken(staff, method = 'password') {
  // Keep the payload minimal: id, role, org, method. No name/email — the token
  // travels with every request and should carry only what authorisation needs.
  return jwt.sign(
    { sub: staff.id, role: staff.role, org: staff.organisation_id, method },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

/**
 * Verify a JWT and return its decoded payload.
 *
 * @param {string} token
 * @returns {{ sub: string, role: string, org: string }} decoded payload
 * @throws if the token is missing, malformed, tampered with, or expired.
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Authenticate a staff member by email + password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, staff: object }>}
 * @throws {{ status: number, message: string }} 401 on any failure, with an
 *         identical message so the caller cannot tell unknown-email from
 *         wrong-password.
 */
async function authenticateStaff(email, password) {
  const normalisedEmail = (email || '').trim().toLowerCase();

  const { data: staff, error } = await supabase
    .from('staff_users')
    .select('id, name, email, role, organisation_id, password_hash, is_active')
    .eq('email', normalisedEmail)
    .maybeSingle();

  // A DB error is a server problem, not a credentials problem — surface it as
  // 500 rather than leaking it as a 401. Do not log the email.
  if (error) {
    console.error('Staff lookup failed during login:', error.message);
    throw { status: 500, message: 'Could not process the login. Please try again.' };
  }

  // No such user. Before throwing, run a THROWAWAY bcrypt.compare against a
  // fixed dummy hash and discard the result. WHY: a wrong-password request (with
  // a real row) always pays the cost of a bcrypt compare below; skipping it here
  // would make an unknown-email response return faster, and that timing gap is a
  // side-channel that leaks which emails exist. Burning the same CPU here
  // equalises the timing, then we throw the SAME generic 401 (no oracle in the
  // message OR the clock).
  if (!staff) {
    await bcrypt.compare(password || '', DUMMY_PASSWORD_HASH);
    throw { status: 401, message: INVALID_CREDENTIALS_MESSAGE };
  }

  const passwordMatches = await bcrypt.compare(password || '', staff.password_hash);
  if (!passwordMatches) {
    throw { status: 401, message: INVALID_CREDENTIALS_MESSAGE };
  }

  // A deactivated account must be indistinguishable from a wrong password: we
  // run the bcrypt.compare FIRST (so timing does not leak "this email is real"),
  // then reject an inactive staff member with the SAME generic 401. Surfacing a
  // distinct "account disabled" message would be a login oracle — it would let
  // an attacker confirm which emails exist, exactly what INVALID_CREDENTIALS_
  // MESSAGE is designed to prevent.
  if (staff.is_active === false) {
    throw { status: 401, message: INVALID_CREDENTIALS_MESSAGE };
  }

  const safeStaff = {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    organisation_id: staff.organisation_id,
  };

  // 'password' method: this session was proven by a password, so /me may allow
  // a password change.
  return { token: signToken(safeStaff, 'password'), staff: safeStaff };
}

/**
 * Authenticate a staff member via a Supabase Google session.
 *
 * The client runs the Supabase Auth Google OAuth flow and hands us the resulting
 * Supabase access token. We verify that token with Supabase (which confirms the
 * Google-verified identity), then require the email to already exist as an
 * ACTIVE staff_users row. Google is only the credential — it can never create a
 * staff account (admins provision those). On success we mint the SAME JWT the
 * password flow issues, so all downstream middleware/roles/audit are unchanged.
 *
 * @param {string} accessToken  Supabase session access token from the client
 * @returns {Promise<{ token: string, staff: object }>}
 * @throws {{ status: number, message: string }} 401 if the token is invalid,
 *         403 if the verified email is not an active staff member.
 */
/**
 * Verify a Supabase Google session token and return the Google-verified email
 * (normalised). Shared by login (map to an existing staff row) and self-signup
 * (create a pending row for this email). Passing the token to getUser validates
 * it server-side via Supabase Auth.
 *
 * @param {string} accessToken  Supabase session access token from the client
 * @returns {Promise<string>} the verified, lowercased email
 * @throws {{ status: number, message: string }} 401 if the token is invalid or
 *         carries no email.
 */
async function verifyGoogleEmail(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw { status: 401, message: 'Google sign-in failed. Please try again.' };
  }
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data || !data.user || !data.user.email) {
    // Invalid/expired token, or a provider that returned no email. Do not log
    // the token or the error detail.
    throw { status: 401, message: 'Google sign-in failed. Please try again.' };
  }
  return data.user.email.trim().toLowerCase();
}

async function authenticateGoogle(accessToken) {
  const email = await verifyGoogleEmail(accessToken);

  const { data: staff, error: lookupError } = await supabase
    .from('staff_users')
    .select('id, name, email, role, organisation_id, is_active')
    .eq('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('Staff lookup failed during Google sign-in:', lookupError.message);
    throw { status: 500, message: 'Could not process the sign-in. Please try again.' };
  }

  // Not provisioned as staff, or deactivated → refused (see NOT_STAFF_MESSAGE).
  if (!staff || staff.is_active === false) {
    throw { status: 403, message: NOT_STAFF_MESSAGE };
  }

  const safeStaff = {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    organisation_id: staff.organisation_id,
  };

  // 'google' method: no password_hash was verified, so /me MUST refuse a
  // password change for this session (see profileService.changeOwnPassword).
  return { token: signToken(safeStaff, 'google'), staff: safeStaff };
}

module.exports = {
  authenticateStaff,
  authenticateGoogle,
  verifyGoogleEmail,
  signToken,
  verifyToken,
  INVALID_CREDENTIALS_MESSAGE,
  NOT_STAFF_MESSAGE,
  TOKEN_TTL,
  // Exported so the timing-equalisation test can assert the dummy-compare path
  // runs against THIS exact hash when no user is found.
  DUMMY_PASSWORD_HASH,
};
