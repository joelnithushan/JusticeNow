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
const { requireStaff } = require('../middleware/auth');
const { getAnalytics } = require('../controllers/analyticsController');

const router = express.Router();

// GET /api/analytics — aggregate counts by status/type/district + monthly volume.
router.get('/', requireStaff, getAnalytics);

module.exports = router;
