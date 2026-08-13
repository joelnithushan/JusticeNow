/**
 * JusticeNow — /api/staff routes.
 *
 * NEXT SPRINT: staff login via Supabase Auth. Remember: ONLY staff
 * (attorneys, advocacy officers) ever authenticate. Reporters never do.
 */

const express = require('express');

const router = express.Router();

router.post('/login', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Staff login is coming in the next sprint.',
  });
});

module.exports = router;
