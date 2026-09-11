/**
 * JusticeNow — /api/reports routes.
 */

const express = require('express');
const multer = require('multer');
const {
  createReport,
  listReports,
  getCase,
  addCaseNote,
  changeCaseStatus,
  assignCase,
} = require('../controllers/reportsController');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// Evidence files are held in memory and streamed straight to Supabase
// Storage — nothing is ever written to the server's own disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
});

// POST /api/reports — anonymous submission ("evidence" = optional file field).
// DELIBERATELY UNGUARDED: reporters never authenticate, so this route must NOT
// carry requireStaff — adding auth here would break anonymous reporting.
router.post('/', upload.single('evidence'), createReport);

// GET /api/reports — staff list with ?case_type= and ?status= filters.
// GUARDED: listing cases is staff-only (see CLAUDE.md authorization matrix —
// "List cases" is NEVER anonymous). requireStaff rejects missing/invalid tokens
// with 401 before the controller runs.
router.get('/', requireStaff, listReports);

// --- Staff case-detail sub-routes (U7). ALL guarded by requireStaff --------
// The full case view and every mutation on a case are staff-only (see CLAUDE.md
// authorization matrix). requireStaff rejects missing/invalid tokens with 401
// before any controller runs.

// GET /api/reports/:id — full case + notes + signed evidence URL + transitions.
router.get('/:id', requireStaff, getCase);

// POST /api/reports/:id/notes — add an internal or reporter-visible note.
router.post('/:id/notes', requireStaff, addCaseNote);

// PATCH /api/reports/:id/status — move through the status state machine.
router.patch('/:id/status', requireStaff, changeCaseStatus);

// PATCH /api/reports/:id/assign — assign or unassign the case to an org.
router.patch('/:id/assign', requireStaff, assignCase);

module.exports = router;
