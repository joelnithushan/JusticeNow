/**
 * JusticeNow — /api/transparency routes.
 *
 * PUBLIC (no auth): the open transparency dashboard. Routes define paths only;
 * the controller/service own the logic. The response is anonymised aggregate
 * counts, safe to serve to anyone (see transparencyService for the guarantees).
 */

const express = require('express');
const { getTransparency } = require('../controllers/transparencyController');

const router = express.Router();

// GET /api/transparency — anonymised platform-wide aggregate figures.
router.get('/', getTransparency);

module.exports = router;
