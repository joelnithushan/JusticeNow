const express = require('express');
const router = express.Router();
const { getHealthStatus } = require('../controllers/healthController');

// GET /api/health - Test health status
router.get('/', getHealthStatus);

module.exports = router;
