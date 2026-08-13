/**
 * JusticeNow — /api/status routes.
 *
 * NEXT SPRINT: GET /api/status/:reference_code will let an anonymous
 * reporter look up their case status and reporter-visible notes using
 * only their reference code.
 */

const express = require('express');

const router = express.Router();

router.get('/:reference_code', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Status lookup is coming in the next sprint.',
  });
});

module.exports = router;
