/**
 * JusticeNow — Staff two-factor authentication (TOTP).
 *
 * ONLY staff authenticate, and a staff account can read case narratives,
 * evidence and internal notes — so a stolen staff password is the highest-value
 * breach path in an otherwise anonymous system. This module adds a second factor
 * (a time-based code from an authenticator app) plus single-use backup codes for
 * a lost device.
 *
 * SHAPE:
 *  - Enrollment stores a base32 `totp_secret` but leaves `mfa_enabled` FALSE
 *    until the staff member proves the secret works by entering a live code.
 *  - Login is two-step: password first (services/auth.js) → if MFA is on, that
 *    returns a short-lived "mfa pending" token instead of a full session; the
 *    client then submits a code here to exchange it for the real JWT.
 *  - Backup codes are bcrypt-hashed and single-use; the plaintext is shown once.
 *
 * PRIVACY: never log the secret, the codes, the pending token, or the email.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const supabase = require('../config/supabase');
const { signToken } = require('./auth');
const { sendOtpEmail } = require('./email');

// Allow one 30s step of clock drift either side — enough for a phone that is a
// little out of sync, without meaningfully widening the guess window.
authenticator.options = { window: 1 };

const ISSUER = 'JusticeNow';
const BACKUP_CODE_COUNT = 8;

// The two second-factor methods a staff account may choose. 'totp' is an
// authenticator app (needs a second device); 'email' sends a code to the staff
// member's inbox (no extra device — handy when a phone app isn't available).
const MFA_METHODS = ['totp', 'email'];

// Email codes are 6 digits and short-lived. The window is wider than a TOTP step
// because email can take a moment to arrive, but still measured in minutes so a
// leaked-inbox code stops being useful quickly.
const EMAIL_OTP_TTL_MINUTES = 10;
const EMAIL_OTP_TTL_MS = EMAIL_OTP_TTL_MINUTES * 60 * 1000;

const JWT_SECRET = process.env.JWT_SECRET;
// A pending-MFA token is deliberately very short-lived: it only bridges the two
// login steps, so a leaked one is useful for minutes, not hours.
const MFA_TOKEN_TTL = '5m';

// Same generic failure for a wrong TOTP code AND a wrong/spent backup code — do
// not tell an attacker which they got wrong.
const INVALID_MFA_MESSAGE = 'That code was not valid. Please try again.';

/** Mint the short-lived token that bridges password → code entry. */
function signMfaToken(staffId) {
  return jwt.sign({ sub: staffId, mfa: 'pending' }, JWT_SECRET, {
    expiresIn: MFA_TOKEN_TTL,
  });
}

/** Verify a TOTP code against a secret. Never throws on a bad code. */
function verifyTotp(secret, token) {
  const code = (token || '').toString().replace(/\s/g, '');
  if (!secret || !/^\d{6}$/.test(code)) return false;
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

/**
 * Generate a 6-digit email OTP as a zero-padded string. crypto.randomInt is a
 * CSPRNG, so the code is not guessable from prior codes.
 */
function generateEmailOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Check a submitted email OTP against a stored hash + expiry. Never throws.
 * @returns {Promise<boolean>} true only if the code matches AND has not expired.
 */
async function verifyEmailOtp(hash, expiresAt, submitted) {
  const code = (submitted || '').toString().replace(/\s/g, '');
  if (!hash || !expiresAt || !/^\d{6}$/.test(code)) return false;
  // An expired code is a miss, even if the digits are right.
  if (Date.parse(expiresAt) < Date.now()) return false;
  try {
    return await bcrypt.compare(code, hash);
  } catch {
    return false;
  }
}

/**
 * Generate a fresh email OTP for a staff member, store ONLY its hash + expiry,
 * and email the plaintext. Used both at enrollment (to prove the address works)
 * and as the second login step for email-method accounts. Overwrites any prior
 * outstanding code, so the newest email is the only one that works.
 *
 * @param {string} staffId
 * @param {string} [knownEmail]  the address if the caller already has it (avoids
 *        a refetch); otherwise it is looked up from the row.
 * @throws {{ status, message }} if the staff row is missing, the DB write fails,
 *         or email delivery fails (see services/email.js).
 */
async function issueEmailOtp(staffId, knownEmail) {
  let email = knownEmail;
  if (!email) {
    const { data: staff, error } = await supabase
      .from('staff_users')
      .select('email')
      .eq('id', staffId)
      .maybeSingle();
    if (error) {
      throw { status: 500, message: 'Could not send the code. Please try again.' };
    }
    if (!staff || !staff.email) {
      throw { status: 400, message: 'Could not send the code. Please try again.' };
    }
    email = staff.email;
  }

  const code = generateEmailOtp();
  const hash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MS).toISOString();

  const { error: upErr } = await supabase
    .from('staff_users')
    .update({ email_otp_hash: hash, email_otp_expires_at: expiresAt })
    .eq('id', staffId);
  if (upErr) {
    throw { status: 500, message: 'Could not send the code. Please try again.' };
  }

  // Sends the PLAINTEXT code in transit only — nothing plaintext is ever stored.
  await sendOtpEmail(email, code, EMAIL_OTP_TTL_MINUTES);
}

/** Generate N human-friendly single-use backup codes (plaintext). */
function generateBackupCodesPlain(n = BACKUP_CODE_COUNT) {
  const codes = [];
  for (let i = 0; i < n; i += 1) {
    // 10 hex chars, grouped as XXXXX-XXXXX for readability.
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

async function hashBackupCodes(plainCodes) {
  return Promise.all(plainCodes.map((c) => bcrypt.hash(c, 10)));
}

/**
 * Check a submitted backup code against the stored hashes.
 * @returns {Promise<{matched: boolean, remaining: string[]}>} remaining drops
 *          the consumed hash so a backup code can be used at most once.
 */
async function consumeBackupCode(hashedCodes, submitted) {
  const code = (submitted || '').toString().trim().toUpperCase();
  const hashes = Array.isArray(hashedCodes) ? hashedCodes : [];
  for (const hash of hashes) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(code, hash)) {
      return { matched: true, remaining: hashes.filter((h) => h !== hash) };
    }
  }
  return { matched: false, remaining: hashes };
}

/**
 * Begin (or restart) enrollment for a staff member with the chosen method. In
 * both cases mfa_enabled stays FALSE until the staff member proves the factor
 * works by entering a live code (see activateMfa).
 *
 *  - 'totp'  : generate a fresh secret and return the QR + otpauth URL to scan.
 *  - 'email' : record the method and email a one-time code to prove the address.
 *
 * @param {string} staffId
 * @param {string} email
 * @param {'totp'|'email'} [method]  defaults to 'totp'.
 * @returns {Promise<{method: string, qrDataUrl?: string, otpauthUrl?: string}>}
 */
async function startEnrollment(staffId, email, method = 'totp') {
  const chosen = MFA_METHODS.includes(method) ? method : 'totp';

  if (chosen === 'email') {
    // No TOTP secret for an email account — clear any stale one so the two
    // methods can never both be "half set up" on one row.
    const { error } = await supabase
      .from('staff_users')
      .update({ mfa_method: 'email', mfa_enabled: false, totp_secret: null })
      .eq('id', staffId);
    if (error) {
      throw { status: 500, message: 'Could not start 2FA setup. Please try again.' };
    }
    // Email the first code so the staffer can confirm they can receive it.
    await issueEmailOtp(staffId, email);
    return { method: 'email' };
  }

  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email || 'staff', ISSUER, secret);

  const { error } = await supabase
    .from('staff_users')
    .update({ totp_secret: secret, mfa_enabled: false, mfa_method: 'totp' })
    .eq('id', staffId);
  if (error) {
    throw { status: 500, message: 'Could not start 2FA setup. Please try again.' };
  }

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { method: 'totp', otpauthUrl, qrDataUrl };
}

/**
 * Finish enrollment: verify a live code against the pending secret, then flip
 * mfa_enabled on and issue fresh backup codes (returned in plaintext ONCE).
 */
async function activateMfa(staffId, code) {
  const { data: staff, error } = await supabase
    .from('staff_users')
    .select('mfa_method, totp_secret, email_otp_hash, email_otp_expires_at, mfa_enabled')
    .eq('id', staffId)
    .maybeSingle();
  if (error) {
    throw { status: 500, message: 'Could not complete 2FA setup. Please try again.' };
  }
  if (!staff) {
    throw { status: 400, message: 'Start 2FA setup before verifying a code.' };
  }

  const method = staff.mfa_method || 'totp';
  if (method === 'email') {
    const ok = await verifyEmailOtp(staff.email_otp_hash, staff.email_otp_expires_at, code);
    if (!ok) {
      throw { status: 400, message: INVALID_MFA_MESSAGE };
    }
  } else {
    if (!staff.totp_secret) {
      throw { status: 400, message: 'Start 2FA setup before verifying a code.' };
    }
    if (!verifyTotp(staff.totp_secret, code)) {
      throw { status: 400, message: INVALID_MFA_MESSAGE };
    }
  }

  const plain = generateBackupCodesPlain();
  const hashed = await hashBackupCodes(plain);
  const { error: upErr } = await supabase
    .from('staff_users')
    // Clear the one-time email code as it has now served its enrollment purpose.
    .update({
      mfa_enabled: true,
      mfa_backup_codes: hashed,
      email_otp_hash: null,
      email_otp_expires_at: null,
    })
    .eq('id', staffId);
  if (upErr) {
    throw { status: 500, message: 'Could not complete 2FA setup. Please try again.' };
  }
  // Plaintext backup codes leave the server exactly once, here.
  return { backupCodes: plain };
}

/**
 * Second login step: exchange a pending-MFA token + a code for a full session.
 * Accepts either a TOTP code or an unused backup code (which is then consumed).
 */
async function completeMfaLogin(mfaToken, code) {
  let payload;
  try {
    payload = jwt.verify(mfaToken, JWT_SECRET);
  } catch {
    throw { status: 401, message: 'Your login session expired. Please sign in again.' };
  }
  if (!payload || payload.mfa !== 'pending' || !payload.sub) {
    throw { status: 401, message: 'Your login session expired. Please sign in again.' };
  }

  const { data: staff, error } = await supabase
    .from('staff_users')
    .select('id, name, email, role, organisation_id, is_active, mfa_enabled, mfa_method, totp_secret, email_otp_hash, email_otp_expires_at, mfa_backup_codes')
    .eq('id', payload.sub)
    .maybeSingle();
  if (error) {
    throw { status: 500, message: 'Could not process the login. Please try again.' };
  }
  // The account must still be an active, MFA-enabled staff member.
  if (!staff || staff.is_active === false || !staff.mfa_enabled) {
    throw { status: 401, message: 'Your login session expired. Please sign in again.' };
  }

  const method = staff.mfa_method || 'totp';
  // Verify the primary factor for whichever method this account uses. An email
  // code, once accepted, is single-use — cleared below so it cannot be replayed.
  let ok =
    method === 'email'
      ? await verifyEmailOtp(staff.email_otp_hash, staff.email_otp_expires_at, code)
      : verifyTotp(staff.totp_secret, code);
  const clearEmailOtp = ok && method === 'email';

  if (!ok) {
    // Fall back to a single-use backup code (works for BOTH methods), consuming
    // it on success.
    const { matched, remaining } = await consumeBackupCode(staff.mfa_backup_codes, code);
    if (matched) {
      const { error: upErr } = await supabase
        .from('staff_users')
        .update({ mfa_backup_codes: remaining })
        .eq('id', staff.id);
      if (upErr) {
        throw { status: 500, message: 'Could not process the login. Please try again.' };
      }
      ok = true;
    }
  }
  if (!ok) {
    throw { status: 401, message: INVALID_MFA_MESSAGE };
  }

  if (clearEmailOtp) {
    // Burn the accepted email code so a second attempt with the same digits fails.
    const { error: clearErr } = await supabase
      .from('staff_users')
      .update({ email_otp_hash: null, email_otp_expires_at: null })
      .eq('id', staff.id);
    if (clearErr) {
      throw { status: 500, message: 'Could not process the login. Please try again.' };
    }
  }

  const safeStaff = {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    organisation_id: staff.organisation_id,
  };
  return { token: signToken(safeStaff, 'password'), staff: safeStaff };
}

/**
 * Second-step helper: re-send an email code to the staffer mid-login. Verifies
 * the short-lived pending-MFA token (so only someone who already passed the
 * password step can trigger an email), then issues a fresh code. Only valid for
 * email-method accounts; a TOTP account has nothing to resend.
 *
 * @param {string} mfaToken  the pending-MFA token from the password step.
 * @throws {{ status, message }} 401 on an expired/invalid token, 400 if the
 *         account does not use the email method.
 */
async function resendEmailOtp(mfaToken) {
  let payload;
  try {
    payload = jwt.verify(mfaToken, JWT_SECRET);
  } catch {
    throw { status: 401, message: 'Your login session expired. Please sign in again.' };
  }
  if (!payload || payload.mfa !== 'pending' || !payload.sub) {
    throw { status: 401, message: 'Your login session expired. Please sign in again.' };
  }

  const { data: staff, error } = await supabase
    .from('staff_users')
    .select('id, email, is_active, mfa_enabled, mfa_method')
    .eq('id', payload.sub)
    .maybeSingle();
  if (error) {
    throw { status: 500, message: 'Could not send the code. Please try again.' };
  }
  if (!staff || staff.is_active === false || !staff.mfa_enabled) {
    throw { status: 401, message: 'Your login session expired. Please sign in again.' };
  }
  if ((staff.mfa_method || 'totp') !== 'email') {
    throw { status: 400, message: 'This account does not use email codes.' };
  }

  await issueEmailOtp(staff.id, staff.email);
}

/**
 * Turn MFA off for a staff member and wipe their secret + backup codes + any
 * outstanding email code, and reset the method to the default. Used by an admin
 * resetting a locked-out colleague (lost device). The caller/route is
 * responsible for the admin authorization check.
 */
async function resetMfa(staffId) {
  const { error } = await supabase
    .from('staff_users')
    .update({
      mfa_enabled: false,
      mfa_method: 'totp',
      totp_secret: null,
      mfa_backup_codes: [],
      email_otp_hash: null,
      email_otp_expires_at: null,
    })
    .eq('id', staffId);
  if (error) {
    throw { status: 500, message: 'Could not reset 2FA. Please try again.' };
  }
}

module.exports = {
  signMfaToken,
  verifyTotp,
  generateEmailOtp,
  verifyEmailOtp,
  issueEmailOtp,
  resendEmailOtp,
  generateBackupCodesPlain,
  hashBackupCodes,
  consumeBackupCode,
  startEnrollment,
  activateMfa,
  completeMfaLogin,
  resetMfa,
  INVALID_MFA_MESSAGE,
  MFA_TOKEN_TTL,
  BACKUP_CODE_COUNT,
  MFA_METHODS,
  EMAIL_OTP_TTL_MINUTES,
};
