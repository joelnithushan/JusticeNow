const express = require('express');
const router = express.Router();
const { getActiveSOS, createSOS } = require('../controllers/sosController');

// GET /api/sos - List active emergency SOS requests
router.get('/', getActiveSOS);

// POST /api/sos - Trigger emergency SOS distress call
router.post('/', createSOS);

module.exports = router;
