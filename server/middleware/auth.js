/**
 * JusticeNow — Staff auth middleware.
 *
 * These guards protect staff-only routes. Reporter-facing routes must NEVER
 * use them — reporters do not authenticate. `requireStaff` proves a valid
 * session; `requireRole` narrows to specific roles (e.g. admin-only routes).
 */

const { verifyToken } = require('../services/auth');

/**
 * Require a valid staff session.
 *
 * Reads `Authorization: Bearer <token>`, verifies it, and attaches
 * `req.staff = { id, role, org }` for downstream handlers. Responds 401 on any
 * missing/invalid token. Never logs the token.
 */
function requireStaff(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Sign in as staff to continue.',
    });
  }

  try {
    const payload = verifyToken(token);
    // Map the compact JWT claims back onto a readable shape for handlers.
    // `method` records which credential proved the session ('password'|'google').
    // Default to 'password' for backward-compat with tokens minted before the
    // claim existed — a missing claim must not lock a real staffer out of /me.
    req.staff = {
      id: payload.sub,
      role: payload.role,
      org: payload.org,
      method: payload.method || 'password',
    };
    return next();
  } catch {
    // Do not distinguish expired/tampered/malformed — one generic 401.
    return res.status(401).json({
      success: false,
      message: 'Your session is invalid or has expired. Please sign in again.',
    });
  }
}

/**
 * Require the authenticated staff member to hold one of `roles`.
 * Must be used AFTER requireStaff, which sets req.staff.
 *
 * @param {...string} roles  the roles permitted on this route
 * @returns Express middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }
    return next();
  };
}

module.exports = { requireStaff, requireRole };
