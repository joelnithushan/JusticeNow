/**
 * JusticeNow — /api/analytics routes.
 *
 * Aggregate dashboard figures for staff. GUARDED by requireStaff: analytics is
 * available to ALL staff roles (officer/attorney/admin) — it is the "dashboard
 * only" entry in the authorization matrix, so no admin-only narrowing here.
 *
 * Routes only — no logic, no Supabase calls (see CLAUDE.md architecture).
 */

const express = require('express');
const { requireStaff, requireApproved } = require('../middleware/auth');
const { getAnalytics } = require('../controllers/analyticsController');

const router = express.Router();

// GET /api/analytics — aggregate counts by status/type/district + monthly volume.
// requireMfaEnrolled: analytics is case-derived data, so non-admins must have 2FA
// enabled (admins exempt) — same mandatory-2FA policy as /api/reports.
router.get('/', requireStaff, requireApproved, getAnalytics);

module.exports = router;
