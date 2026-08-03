/**
 * Community Hazard Alert & Response System - Express Backend Server
 * Team: SPM_NU_WE_01
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import Routes
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const hazardRoutes = require('./routes/hazardRoutes');
const sosRoutes = require('./routes/sosRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for Frontend Client
const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
app.use(cors({
  origin: [clientUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));

// Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware (Development)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/hazards', hazardRoutes);
app.use('/api/sos', sosRoutes);

// Root Welcome Endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Sri Lanka Community Hazard Alert & Response API',
    group: 'SPM_NU_WE_01',
    documentation: '/api/health'
  });
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl} - Route Not Found`
  });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message
  });
});

// Start Express Server Listener
app.listen(PORT, () => {
  console.log(`
======================================================
  🚨 Community Hazard Alert & Response System API 🚨
  Group ID: SPM_NU_WE_01
  Server running at: http://localhost:${PORT}
  Health check:     http://localhost:${PORT}/api/health
======================================================
  `);
});
