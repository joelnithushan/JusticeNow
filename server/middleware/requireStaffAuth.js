/**
 * JusticeNow — Staff authentication middleware (JNOW-13).
 *
 * WHY THIS EXISTS
 * Staff-only endpoints (change status, read/add case notes) must reject
 * anyone who is not a signed-in staff member. JNOW-32 added staff login on the
 * CLIENT (Supabase Auth — the JWT lives in the browser); this middleware is the
 * SERVER counterpart that verifies that JWT on each protected request.
 *
 * It is intentionally NOT a new auth system of its own — it validates the
 * existing Supabase session by asking Supabase who the token belongs to. If
 * JNOW-32 later adds its own server-side auth, this is the single place to
 * reconcile; every protected route imports this one function.
 *
 * INTERFACE (what downstream handlers can rely on):
 *   req.staffUser = { id, email }   // the authenticated Supabase auth user
 * On any failure we respond 401 with a generic message and never call next().
 *
 * ANONYMITY: this concerns STAFF identity only. It never touches reporter data.
 */

const supabase = require('../config/supabase');

async function requireStaffAuth(req, res, next) {
  // Expect a bearer token: "Authorization: Bearer <supabase access token>".
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  try {
    // Ask Supabase to validate the JWT and return its user. A tampered or
    // expired token yields an error or no user — both are treated as 401.
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Attach only what downstream handlers need. No reporter data here.
    req.staffUser = { id: data.user.id, email: data.user.email };
    return next();
  } catch (err) {
    // Never leak the underlying error to the caller.
    console.error('Staff auth verification failed:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }
}

module.exports = requireStaffAuth;
