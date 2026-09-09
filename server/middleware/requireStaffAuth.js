/**
 * JusticeNow — Staff authentication middleware (JNOW-13 / JNOW-36).
 *
 * WHY THIS EXISTS
 * Staff-only endpoints must reject anyone who is not a signed-in staff
 * member. Two token shapes are accepted:
 *
 *  1. App-signed JWTs (JWT_SECRET) carrying role + organisation_id claims.
 *     Used by org-scoping features (assign/refer) and their integration tests.
 *  2. Supabase Auth access tokens — validated via supabase.auth.getUser.
 *     Used by the existing staff login flow (JNOW-32).
 *
 * INTERFACE (what downstream handlers can rely on):
 *   req.staffUser = {
 *     id,                 // auth subject / staff id
 *     email,
 *     role?,              // 'officer' | 'org_admin' | 'admin' (platform)
 *     organisation_id?,   // org the staff belongs to (null for platform admin)
 *   }
 *
 * ANONYMITY: this concerns STAFF identity only. It never touches reporter data.
 */

const supabase = require('../config/supabase');
const { verifyStaffToken } = require('../utils/staffJwt');

async function requireStaffAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  try {
    // Prefer our own JWT when JWT_SECRET is configured — tests and org-scoped
    // routes rely on role / organisation_id claims living on the token.
    const secret = process.env.JWT_SECRET;
    if (secret) {
      const claims = verifyStaffToken(token, secret);
      if (claims) {
        req.staffUser = {
          id: claims.sub || claims.id,
          email: claims.email || null,
          role: claims.role || null,
          organisation_id: claims.organisation_id ?? claims.org_id ?? null,
        };
        return next();
      }
    }

    // Fall back to Supabase Auth (browser staff session from JNOW-32).
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    req.staffUser = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.user_metadata?.role || null,
      organisation_id:
        data.user.user_metadata?.organisation_id ||
        data.user.app_metadata?.organisation_id ||
        null,
    };
    return next();
  } catch (err) {
    console.error('Staff auth verification failed:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }
}

module.exports = requireStaffAuth;
