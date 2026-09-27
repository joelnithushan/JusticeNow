/**
 * JusticeNow — outbound email (staff 2FA codes only).
 *
 * The ONLY thing this app emails is a one-time login code to a STAFF member who
 * chose email-based 2FA. Reporters never authenticate and never receive email,
 * so there is no reporter PII here by construction.
 *
 * Delivery is Gmail SMTP via a Gmail App Password (NOT the account password) —
 * see server/.env.example (SMTP_USER / SMTP_PASS / SMTP_FROM). Email is OPTIONAL
 * infrastructure: if it is not configured, TOTP 2FA still works and only the
 * email-code path reports a clear, typed error instead of failing obscurely.
 *
 * PRIVACY: never log the recipient address or the code. The transporter is built
 * lazily and reused, so a server that never sends email never opens a connection.
 */

const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
// The visible "from" — defaults to the sending account when not set separately.
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

let transporter = null;

/** True only when Gmail SMTP credentials are present. */
function isEmailConfigured() {
  return Boolean(SMTP_USER && SMTP_PASS);
}

/** Build the Gmail transporter once and reuse it. Returns null if unconfigured. */
function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Email a one-time 2FA code to a staff member.
 *
 * @param {string} to    the staff member's email address
 * @param {string} code  the 6-digit code (plaintext, in transit only)
 * @param {number} ttlMinutes  how long the code stays valid, for the message body
 * @throws {{ status: 500, message: string }} if email is not configured or the
 *         send fails — a typed error the caller surfaces as a 500 without leaking
 *         the address or the underlying SMTP detail.
 */
async function sendOtpEmail(to, code, ttlMinutes) {
  const tx = getTransporter();
  if (!tx) {
    throw {
      status: 500,
      message: 'Email delivery is not set up on the server. Ask an admin to configure it, or use an authenticator app.',
    };
  }
  try {
    await tx.sendMail({
      from: `JusticeNow <${SMTP_FROM}>`,
      to,
      subject: 'Your JusticeNow verification code',
      text:
        `Your JusticeNow verification code is ${code}.\n\n` +
        `It expires in ${ttlMinutes} minutes. Enter it on the sign-in screen to ` +
        `finish logging in.\n\nIf you did not try to sign in, you can ignore this ` +
        `email — your account is safe.`,
    });
  } catch (err) {
    // Do NOT log `to` or `code`. Keep the SMTP detail server-side only.
    console.error('Failed to send 2FA email:', err && err.message);
    throw { status: 500, message: 'Could not send the code by email. Please try again.' };
  }
}

module.exports = { isEmailConfigured, sendOtpEmail };
