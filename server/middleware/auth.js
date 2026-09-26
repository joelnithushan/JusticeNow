/**
 * JusticeNow — Staff auth middleware.
 *
 * These guards protect staff-only routes. Reporter-facing routes must NEVER
 * use them — reporters do not authenticate. `requireStaff` proves a valid
 * session; `requireRole` narrows to specific roles (e.g. admin-only routes).
 */

const { verifyToken } = require('../services/auth');
const supabase = require('../config/supabase');

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

/**
 * Mandatory two-factor gate for CASE DATA. Must be used AFTER requireStaff.
 *
 * Policy (product decision): every staff member handling case data must have 2FA
 * enabled first — the system admin ('admin') is the ONLY exemption (they bootstrap
 * the org and manage accounts). For everyone else we look up the CURRENT
 * mfa_enabled flag (not the token — a staffer may enrol mid-session, and a stale
 * token must not keep them locked out or wrongly let them in) and, if 2FA is off,
 * refuse with a 403 carrying `code: 'MFA_REQUIRED'` so the client can route them
 * to enrolment. This is the real security boundary; the client redirect is only UX.
 */
async function requireMfaEnrolled(req, res, next) {
  // System admin is exempt from the mandatory-2FA gate.
  if (req.staff && req.staff.role === 'admin') {
    return next();
  }
  try {
    const { data, error } = await supabase
      .from('staff_users')
      .select('mfa_enabled')
      .eq('id', req.staff.id)
      .maybeSingle();
    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Could not verify your security settings. Please try again.',
      });
    }
    if (data && data.mfa_enabled === true) {
      return next();
    }
    return res.status(403).json({
      success: false,
      code: 'MFA_REQUIRED',
      message: 'Enable two-factor authentication to access case data.',
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: 'Could not verify your security settings. Please try again.',
    });
  }
}

/**
 * Require the account to be APPROVED by an admin before it can touch case data.
 * Must be used AFTER requireStaff. The onboarding lifecycle is
 * onboarding → pending → approved: only 'approved' accounts get case access. The
 * system admin ('admin') is exempt (they are the approver and are provisioned
 * approved). Looked up fresh each request so a just-approved account works
 * immediately and a just-revoked one is cut off at once.
 */
async function requireApproved(req, res, next) {
  if (req.staff && req.staff.role === 'admin') {
    return next();
  }
  try {
    const { data, error } = await supabase
      .from('staff_users')
      .select('access_status')
      .eq('id', req.staff.id)
      .maybeSingle();
    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Could not verify your account status. Please try again.',
      });
    }
    if (data && data.access_status === 'approved') {
      return next();
    }
    return res.status(403).json({
      success: false,
      code: 'NOT_APPROVED',
      message: 'Your account is awaiting admin approval.',
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: 'Could not verify your account status. Please try again.',
    });
  }
}

module.exports = { requireStaff, requireRole, requireMfaEnrolled, requireApproved };
