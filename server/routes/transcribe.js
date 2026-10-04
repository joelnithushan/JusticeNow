/**
 * JusticeNow — /api/transcribe route.
 *
 * PUBLIC voice-to-text proxy for the report wizard's voice recorder. Rate-limited
 * (it calls a paid Google endpoint and is unauthenticated). The audio is held in
 * memory only — never written to disk — and is never logged.
 */

const express = require('express');
const multer = require('multer');
const { transcribe } = require('../controllers/transcriptionController');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// In-memory only: the audio is case content and must never touch the disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap (short spoken reports)
});

// Throttle per IP — the Speech-to-Text calls cost money and are unauthenticated.
const transcribeRateLimiter = createRateLimiter();

router.post('/', transcribeRateLimiter, upload.single('audio'), transcribe);

module.exports = router;
