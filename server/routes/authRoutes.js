const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/authController');

// POST /api/auth/register - User Registration
router.post('/register', registerUser);

// POST /api/auth/login - User Login
router.post('/login', loginUser);

module.exports = router;
