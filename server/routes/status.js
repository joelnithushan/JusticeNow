/**
 * JusticeNow — /api/status routes.
 *
 * Anonymous reporters look up their case status and reporter-visible notes using
 * only their reference code. This route is UNAUTHENTICATED by design (reporters
 * never log in) and MUST stay rate-limited: the reference code is a guessable
 * password, so the limiter throttles brute-force enumeration.
 *
 * Routes only — no logic, no Supabase calls here (see CLAUDE.md architecture).
 */

const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');
const { getStatus } = require('../controllers/statusController');

const router = express.Router();

// One limiter instance per process, closing over its own attempt map.
const statusRateLimiter = createRateLimiter();

// The limiter runs first and, on breach, flags req.isRateLimited so the
// controller can answer with the SAME generic 404 it uses for "not found".
router.get('/:reference_code', statusRateLimiter, getStatus);

module.exports = router;
