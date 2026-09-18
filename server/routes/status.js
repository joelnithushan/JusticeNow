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
const { getStatus, postMessage } = require('../controllers/statusController');

const router = express.Router();

// ONE limiter instance per process, shared by BOTH routes so a caller's lookups
// and message posts count against the same per-IP budget. Sharing matters: the
// message endpoint is also keyed on the guessable reference code, so it must be
// throttled on the same window — otherwise it would reopen the enumeration hole
// the GET limiter closes.
const statusRateLimiter = createRateLimiter();

// POST is declared before the ':reference_code' GET so '/message' can never be
// captured as a reference code by the parameterised route. A reporter posts a
// reply on their own case: { reference_code, message }.
router.post('/message', statusRateLimiter, postMessage);

// The limiter runs first and, on breach, flags req.isRateLimited so the
// controller can answer with the SAME generic 404 it uses for "not found".
router.get('/:reference_code', statusRateLimiter, getStatus);

module.exports = router;
