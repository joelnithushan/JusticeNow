/**
 * JusticeNow — /api/organisations routes.
 *
 * NEXT SPRINT: GET /api/organisations will power the legal resource
 * directory (filter by district and case type).
 */

const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'The organisation directory is coming in the next sprint.',
  });
});

module.exports = router;
