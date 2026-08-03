const express = require('express');
const router = express.Router();
const { getAllHazards, createHazard } = require('../controllers/hazardController');

// GET /api/hazards - List all reported hazards
router.get('/', getAllHazards);

// POST /api/hazards - Submit new hazard report
router.post('/', createHazard);

module.exports = router;
