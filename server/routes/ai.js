/**
 * JusticeNow — /api/ai routes.
 *
 * PUBLIC legal-guidance assistant. Rate-limited (it calls a paid AI endpoint and
 * is unauthenticated). Routes define paths only; logic lives in the controller/
 * service. No scenario or response is ever logged or stored.
 */

const express = require('express');
const { guidance } = require('../controllers/aiController');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Throttle per IP — the AI call costs money and is unauthenticated.
const aiRateLimiter = createRateLimiter();

// POST /api/ai/guidance — scenario in, educational guidance + real org referrals out.
router.post('/guidance', aiRateLimiter, guidance);

module.exports = router;
