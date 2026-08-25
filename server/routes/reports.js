/**
 * JusticeNow — /api/reports routes.
 */

const express = require('express');
const multer = require('multer');
const {
  createReport,
  listReports,
  getReport,
  updateStatus,
  addNote,
  listNotes,
} = require('../controllers/reportsController');
const requireStaffAuth = require('../middleware/requireStaffAuth');

const router = express.Router();

// Evidence files are held in memory and streamed straight to Supabase
// Storage — nothing is ever written to the server's own disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
});

// POST /api/reports — anonymous submission ("evidence" = optional file field)
router.post('/', upload.single('evidence'), createReport);

// GET /api/reports — staff list with ?case_type= and ?status= filters
router.get('/', listReports);

// ── Staff case-management routes (JNOW-13) — all require a staff session ──
// GET    /api/reports/:id         — single case for the detail view
// PATCH  /api/reports/:id/status  — change workflow status
// POST   /api/reports/:id/notes   — add a dated note (internal or reporter-visible)
// GET    /api/reports/:id/notes   — list all notes for a case, newest first
router.get('/:id', requireStaffAuth, getReport);
router.patch('/:id/status', requireStaffAuth, updateStatus);
router.post('/:id/notes', requireStaffAuth, addNote);
router.get('/:id/notes', requireStaffAuth, listNotes);

module.exports = router;
