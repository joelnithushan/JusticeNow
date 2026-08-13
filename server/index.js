/**
 * JusticeNow — Express Backend Server
 *
 * Entry point: loads the app from app.js and starts the HTTP listener.
 */

const app = require('./app');

const PORT = process.env.PORT || 5000;

// Start Express Server Listener
app.listen(PORT, () => {
  console.log(`
======================================================
  JusticeNow API — anonymous case reporting (SDG 16)
  Server running at: http://localhost:${PORT}
  Health check:      http://localhost:${PORT}/api/health
======================================================
  `);
});
