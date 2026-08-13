/**
 * JusticeNow — Express App
 *
 * Exports the configured Express app (no listener) so it can be
 * used by both index.js (server start) and the test suite.
 *
 * PRIVACY NOTE: request logging deliberately records only the method and
 * path — never request bodies, and never IP addresses. Reports must stay
 * anonymous end to end.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import Routes
const healthRoutes = require('./routes/health');
const reportRoutes = require('./routes/reports');
const statusRoutes = require('./routes/status');
const organisationRoutes = require('./routes/organisations');
const staffRoutes = require('./routes/staff');

const app = express();

// Enable CORS for the frontend client
const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
app.use(cors({
  origin: [clientUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
}));

// Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware (method + path only — see privacy note above)
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/organisations', organisationRoutes);
app.use('/api/staff', staffRoutes);

// Root Welcome Endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'JusticeNow API — anonymous human rights case reporting for Sri Lanka',
    documentation: '/api/health',
  });
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl} - Route Not Found`,
  });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message,
  });
});

module.exports = app;
