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

// Allow one 30s step of clock drift either side — enough for a phone that is a
// little out of sync, without meaningfully widening the guess window.
authenticator.options = { window: 1 };

const ISSUER = 'JusticeNow';
const BACKUP_CODE_COUNT = 8;

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
 * Begin (or restart) enrollment for a staff member. Generates a fresh secret,
 * stores it with mfa_enabled still FALSE, and returns the QR + otpauth URL for
 * their authenticator app. The secret itself is not returned in plaintext beyond
 * what the otpauth URL needs for scanning.
 */
async function startEnrollment(staffId, email) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email || 'staff', ISSUER, secret);

  const { error } = await supabase
    .from('staff_users')
    .update({ totp_secret: secret, mfa_enabled: false })
    .eq('id', staffId);
  if (error) {
    throw { status: 500, message: 'Could not start 2FA setup. Please try again.' };
  }

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { otpauthUrl, qrDataUrl };
}

/**
 * Finish enrollment: verify a live code against the pending secret, then flip
 * mfa_enabled on and issue fresh backup codes (returned in plaintext ONCE).
 */
async function activateMfa(staffId, code) {
  const { data: staff, error } = await supabase
    .from('staff_users')
    .select('totp_secret, mfa_enabled')
    .eq('id', staffId)
    .maybeSingle();
  if (error) {
    throw { status: 500, message: 'Could not complete 2FA setup. Please try again.' };
  }
  if (!staff || !staff.totp_secret) {
    throw { status: 400, message: 'Start 2FA setup before verifying a code.' };
  }
  if (!verifyTotp(staff.totp_secret, code)) {
    throw { status: 400, message: INVALID_MFA_MESSAGE };
  }

  const plain = generateBackupCodesPlain();
  const hashed = await hashBackupCodes(plain);
  const { error: upErr } = await supabase
    .from('staff_users')
    .update({ mfa_enabled: true, mfa_backup_codes: hashed })
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
    .select('id, name, email, role, organisation_id, is_active, mfa_enabled, totp_secret, mfa_backup_codes')
    .eq('id', payload.sub)
    .maybeSingle();
  if (error) {
    throw { status: 500, message: 'Could not process the login. Please try again.' };
  }
  // The account must still be an active, MFA-enabled staff member.
  if (!staff || staff.is_active === false || !staff.mfa_enabled) {
    throw { status: 401, message: 'Your login session expired. Please sign in again.' };
  }

  let ok = verifyTotp(staff.totp_secret, code);
  if (!ok) {
    // Fall back to a single-use backup code, consuming it on success.
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
 * Turn MFA off for a staff member and wipe their secret + backup codes. Used by
 * an admin resetting a locked-out colleague (lost device). The caller/route is
 * responsible for the admin authorization check.
 */
async function resetMfa(staffId) {
  const { error } = await supabase
    .from('staff_users')
    .update({ mfa_enabled: false, totp_secret: null, mfa_backup_codes: [] })
    .eq('id', staffId);
  if (error) {
    throw { status: 500, message: 'Could not reset 2FA. Please try again.' };
  }
}

module.exports = {
  signMfaToken,
  verifyTotp,
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
};
