/**
 * Community Hazard Alert & Response System - Express Backend Server
 * Team: SPM_NU_WE_01
 *
 * Entry point: loads the app from app.js and starts the HTTP listener.
 */

const app = require('./app');

const PORT = process.env.PORT || 5000;

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
