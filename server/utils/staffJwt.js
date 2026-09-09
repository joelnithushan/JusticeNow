/**
 * JusticeNow — HS256 staff JWT helpers (no external jwt library).
 *
 * WHY: integration tests and the assign endpoint need role + organisation
 * claims on the staff principal. We sign/verify with JWT_SECRET using Node's
 * built-in crypto so the server stays dependency-light.
 *
 * These tokens are for STAFF only. They never carry reporter identity.
 */

const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlJson(obj) {
  return base64url(JSON.stringify(obj));
}

/**
 * Sign a staff JWT. Used by tests (and any future login path that issues
 * our own tokens). Claims must include role + organisation_id for org-scoping.
 */
function signStaffToken(claims, secret, expiresInSeconds = 3600) {
  if (!secret) throw new Error('JWT_SECRET is required to sign staff tokens');

  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64urlJson({
    ...claims,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
  const data = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verify a staff JWT. Returns the payload or null if invalid/expired.
 */
function verifyStaffToken(token, secret) {
  if (!token || !secret) return null;

  const parts = String(token).split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const data = `${header}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (parsed.exp && Math.floor(Date.now() / 1000) > parsed.exp) return null;
  return parsed;
}

module.exports = { signStaffToken, verifyStaffToken };
