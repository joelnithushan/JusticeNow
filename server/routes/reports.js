/**
 * JusticeNow — /api/reports routes.
 */

const express = require('express');
const multer = require('multer');
const { createReport, listReports } = require('../controllers/reportsController');

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

module.exports = router;
