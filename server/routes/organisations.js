/**
 * JusticeNow — /api/organisations routes.
 *
 * NEXT SPRINT: GET /api/organisations will power the legal resource
 * directory (filter by district and case type).
 */

const express = require('express');
const { listOrganisations } = require('../controllers/organisationsController');

const router = express.Router();

router.get('/', listOrganisations);

module.exports = router;
