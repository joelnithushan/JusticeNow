/**
 * JusticeNow — /api/organisations routes.
 *
 * The PUBLIC legal resource directory: anonymous reporters browse active
 * legal-aid organisations, filter by district / case type, and open one for
 * contact details. UNAUTHENTICATED by design (reporters never log in).
 *
 * Routes only — no logic, no Supabase calls here (see CLAUDE.md architecture).
 */

const express = require('express');
const {
  list,
  getOne,
  listAll,
  create,
  update,
  deactivate,
} = require('../controllers/organisationsController');
const { requireStaff, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/organisations — list active orgs with ?district= and ?case_type=
// filters. PUBLIC and UNGUARDED by design (reporters never authenticate).
router.get('/', list);

// --- ADMIN organisation management (U10). ALL guarded requireStaff + admin ---
// "Manage organisations and staff" is ADMIN ONLY (CLAUDE.md authorization
// matrix). The guards are the REAL boundary; the mobile isAdmin check is UX.

// GET /api/organisations/all — admin list of ALL orgs (incl. inactive).
// MUST be declared BEFORE the '/:id' route below, or Express would capture
// "all" as an :id and route it to the public getOne handler.
router.get('/all', requireStaff, requireRole('admin'), listAll);

// POST /api/organisations — admin create.
router.post('/', requireStaff, requireRole('admin'), create);

// PUT /api/organisations/:id — admin update (partial; may toggle is_active).
router.put('/:id', requireStaff, requireRole('admin'), update);

// DELETE /api/organisations/:id — admin SOFT-delete (deactivate; never a DB
// DELETE — that would cascade-delete the org's staff_users).
router.delete('/:id', requireStaff, requireRole('admin'), deactivate);

// GET /api/organisations/:id — one active org's public detail. PUBLIC and
// UNGUARDED. Declared AFTER '/all' so the static path wins.
router.get('/:id', getOne);

module.exports = router;
