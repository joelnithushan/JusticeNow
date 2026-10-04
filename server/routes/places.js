/**
 * JusticeNow — /api/places routes.
 *
 * PUBLIC place-search proxy for the map location picker. Rate-limited (it calls a
 * paid Google endpoint and is unauthenticated). Routes define paths only; logic
 * lives in the controller/service. The query is never logged or stored.
 */

const express = require('express');
const { autocomplete, details } = require('../controllers/placesController');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Throttle per IP — the Places calls cost money and are unauthenticated.
const placesRateLimiter = createRateLimiter();

// POST (not GET) so the typed place text stays in the body and never lands in
// the request log's URL. details uses an opaque place_id, so GET is fine.
router.post('/autocomplete', placesRateLimiter, autocomplete);
router.get('/details', placesRateLimiter, details);

module.exports = router;
