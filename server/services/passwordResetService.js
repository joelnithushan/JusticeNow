/**
 * JusticeNow — Staff password reset by email code.
 *
 * A self-service reset for NORMAL email/password staff accounts (Google accounts
 * have no password and are refused). Two steps:
 *   1. requestReset(email): if the email maps to an ACTIVE password account, store
 *      a hashed 6-digit code + expiry and email the plaintext code. Otherwise do
 *      nothing. The caller ALWAYS returns an identical response either way — no
 *      oracle that reveals whether an email is registered (mirrors the anonymous
 *      status-lookup rule in CLAUDE.md).
 *   2. resetPassword(email, code, newPassword): verify the code (hash + expiry),
 *      enforce the password policy, set the new password_hash and clear the code.
 *
 * PRIVACY: the plaintext code is emailed in transit only — only its bcrypt hash is
 * stored. Never log the email, code, or password.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { sendOtpEmail, isEmailConfigured } = require('./email');

const RESET_TTL_MINUTES = 30;
const RESET_TTL_MS = RESET_TTL_MINUTES * 60 * 1000;
const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;

/** CSPRNG 6-digit code, zero-padded. */
function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Step 1 — request a reset code. NO ORACLE: resolves the same regardless of
 * whether the email exists / is a password account, so callers can return an
 * identical generic message. Only a genuine active password account is emailed.
 */
async function requestReset(email) {
  const clean = (email || '').trim().toLowerCase();
  if (!clean || !isEmailConfigured()) return;

  const { data: staff, error } = await supabase
    .from('staff_users')
    .select('id, email, is_active, password_hash')
    .eq('email', clean)
    .maybeSingle();
  // Silent on any miss: unknown email, deactivated account, or a Google-only
  // account (no password_hash). No error is surfaced — that would be an oracle.
  if (error || !staff || staff.is_active === false || !staff.password_hash) return;

  const code = generateCode();
  const hash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  const { error: upErr } = await supabase
    .from('staff_users')
    .update({ pw_reset_hash: hash, pw_reset_expires_at: expiresAt })
    .eq('id', staff.id);
  if (upErr) return; // fail quietly — still no oracle

  try {
    await sendOtpEmail(staff.email, code, RESET_TTL_MINUTES);
  } catch {
    // Delivery failure is not surfaced to the caller (no oracle); the staffer can
    // simply request another code.
  }
}

/**
 * Step 2 — verify the code and set the new password. Generic failure message for
 * a wrong email OR wrong/expired code (no oracle). Throws { status, message }.
 */
async function resetPassword(email, code, newPassword) {
  const clean = (email || '').trim().toLowerCase();
  const submitted = (code || '').toString().replace(/\s/g, '');

  if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
    throw { status: 400, message: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (!clean || !/^\d{6}$/.test(submitted)) {
    throw { status: 400, message: 'That reset code is invalid or has expired. Please request a new one.' };
  }

  const { data: staff, error } = await supabase
    .from('staff_users')
    .select('id, is_active, password_hash, pw_reset_hash, pw_reset_expires_at')
    .eq('email', clean)
    .maybeSingle();

  // Identical failure for every "no valid reset" case so nothing is revealed.
  const invalid = { status: 400, message: 'That reset code is invalid or has expired. Please request a new one.' };
  if (error || !staff || staff.is_active === false || !staff.password_hash) throw invalid;
  if (!staff.pw_reset_hash || !staff.pw_reset_expires_at) throw invalid;
  if (Date.parse(staff.pw_reset_expires_at) < Date.now()) throw invalid;

  let matches = false;
  try {
    matches = await bcrypt.compare(submitted, staff.pw_reset_hash);
  } catch {
    matches = false;
  }
  if (!matches) throw invalid;

  const newHash = await bcrypt.hash(String(newPassword), BCRYPT_COST);
  const { error: upErr } = await supabase
    .from('staff_users')
    // Set the new password AND clear the one-time code so it cannot be reused.
    .update({ password_hash: newHash, pw_reset_hash: null, pw_reset_expires_at: null })
    .eq('id', staff.id);
  if (upErr) {
    throw { status: 500, message: 'Could not reset your password. Please try again.' };
  }
}

module.exports = { requestReset, resetPassword, RESET_TTL_MINUTES };
