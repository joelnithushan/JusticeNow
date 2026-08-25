/**
 * JusticeNow — /api/status routes (JNOW-11).
 *
 * Rate-limiting is applied only to this router because it is the single
 * place where an attacker could guess reference codes by brute force.
 * 20 requests per 15 minutes per IP is generous enough for legitimate
 * reporters re-checking their status, but tight enough to make systematic
 * guessing impractical against a 10-character base-32 code space.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { getCaseStatus } = require('../controllers/statusController');

const router = express.Router();

// ---- Rate limiter ----
// windowMs: 15 minutes
// limit:    20 requests per window per IP
// The generic 429 message deliberately does not confirm that the endpoint
// is for case lookup — just "Too many requests".
const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: 'draft-7', // Return rate-limit info in the `RateLimit-*` headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please wait a few minutes and try again.',
  },
});

// GET /api/status/:referenceCode
router.get('/:referenceCode', statusLimiter, getCaseStatus);

module.exports = router;
