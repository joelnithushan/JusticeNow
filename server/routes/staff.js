/**
 * JusticeNow — /api/staff routes.
 *
 * Routes define paths only; logic lives in the controller/service. ONLY staff
 * (attorneys, advocacy officers, admins) ever authenticate here. Reporters
 * never do.
 *
 * POST /login is PUBLIC (it is what mints a token). Everything else is ADMIN
 * staff-account management — "Manage organisations and staff" is ADMIN ONLY
 * (CLAUDE.md authorization matrix) — so it is guarded by requireStaff +
 * requireRole('admin'). The guards are the REAL boundary; the mobile isAdmin
 * check is UX.
 */

const express = require('express');
const multer = require('multer');
const {
  login,
  googleLogin,
  register,
  registerGoogle,
  listStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  getMe,
  updateMe,
  updateMyAvatar,
  changeMyPassword,
} = require('../controllers/staffController');
const { requireStaff, requireRole } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Per-IP throttle for the PUBLIC login endpoint ONLY. WHY: /login is an
// unauthenticated password-guessing surface — without a cap it invites
// brute-force/credential-stuffing against staff accounts. We reuse the same
// in-memory limiter the anonymous status endpoint uses (10 attempts / 15 min by
// default). It flags req.isRateLimited and calls next(); the login controller
// decides the 429 response. This limiter is DELIBERATELY NOT applied to /me or
// the admin routes — those are already token-guarded and must stay responsive.
const loginRateLimiter = createRateLimiter();

// Avatars are held in memory and streamed straight to Supabase Storage —
// nothing is written to the server's own disk (mirrors reportsController). The
// image type + ~5MB cap are re-checked in the service, the real authority.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // ~5 MB cap
});

// POST /api/staff/login — PUBLIC (no token yet; this endpoint mints one). The
// limiter runs first and, on breach, flags req.isRateLimited so the controller
// returns a 429 (see login). Applied to /login ONLY, never to /me or admin.
router.post('/login', loginRateLimiter, login);

// POST /api/staff/google — PUBLIC. Exchanges a Supabase Google session for our
// JWT, but ONLY if the Google-verified email is an active staff_users member.
router.post('/google', googleLogin);

// POST /api/staff/register — PUBLIC self-service signup (email + password). Rate
// -limited (reuses the login limiter) to stop automated account-spam. Creates a
// PENDING (inactive) account; an admin must activate it before it can log in.
// The service forbids the 'admin' role here. Declared BEFORE the '/:id' routes.
router.post('/register', loginRateLimiter, register);

// POST /api/staff/register/google — PUBLIC self-service signup via Google. Same
// pending-approval gate; the email comes from the Google-verified identity.
router.post('/register/google', loginRateLimiter, registerGoogle);

// --- Self-service profile. ALL guarded requireStaff; each operates on the
// caller's OWN record (req.staff.id). These MUST be declared BEFORE the '/:id'
// routes below, or Express would capture "me" as an :id and route it to the
// admin update/delete handlers. ---

// GET /api/staff/me — the caller's own profile (never password_hash).
router.get('/me', requireStaff, getMe);

// PATCH /api/staff/me — update the caller's editable fields (server-validated).
router.patch('/me', requireStaff, updateMe);

// POST /api/staff/me/avatar — upload the caller's avatar (multipart `avatar`).
router.post('/me/avatar', requireStaff, avatarUpload.single('avatar'), updateMyAvatar);

// POST /api/staff/me/password — change the caller's own password (password
// accounts only; refused for Google sessions).
router.post('/me/password', requireStaff, changeMyPassword);

// --- Staff-account management. Guarded requireStaff + (admin OR org_admin).
// A platform admin manages every account; an org_admin is scoped to their own
// organisation (the service enforces the scope — the route only gates the role).

// GET /api/staff — list staff (platform admin: all; org_admin: own org only).
// NEVER returns password_hash (the service projection omits it).
router.get('/', requireStaff, requireRole('admin', 'org_admin'), listStaff);

// POST /api/staff — create (bcrypt-hashes the password server-side).
router.post('/', requireStaff, requireRole('admin', 'org_admin'), createStaff);

// PUT /api/staff/:id — update (partial; may rehash password, toggle active).
router.put('/:id', requireStaff, requireRole('admin', 'org_admin'), updateStaff);

// DELETE /api/staff/:id — SOFT-delete (deactivate; never a DB DELETE — that
// would strip the actor from the audit trail). Refuses self / last-admin.
router.delete('/:id', requireStaff, requireRole('admin', 'org_admin'), deactivateStaff);

module.exports = router;
