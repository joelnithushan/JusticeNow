/**
 * JusticeNow — /api/audit routes (ADMIN only).
 *
 * The append-only staff-action trail. GUARDED by requireStaff THEN
 * requireRole('admin'): the audit trail is ADMIN-ONLY in the authorization
 * matrix (CLAUDE.md). requireStaff proves a valid session (401 otherwise);
 * requireRole('admin') narrows to admins (403 for officer/attorney). The order
 * matters — requireRole reads req.staff, which requireStaff sets.
 *
 * Routes only — no logic, no Supabase calls (see CLAUDE.md architecture).
 */

const express = require('express');
const { requireStaff, requireRole } = require('../middleware/auth');
const { listAudit } = require('../controllers/auditController');

const router = express.Router();

// GET /api/audit — paginated (?limit=&offset=&action=) newest-first entries.
router.get('/', requireStaff, requireRole('admin'), listAudit);

module.exports = router;
