/**
 * JusticeNow — Public transparency controller.
 *
 * Serves the open, anonymised aggregate dashboard. PUBLIC (no auth): reporters
 * and the general public read it. The service guarantees the payload is
 * counts-only; this layer just orchestrates and never logs case content.
 */

const { getPublicStats } = require('../services/transparencyService');

/**
 * GET /api/transparency — anonymised aggregate figures for the public dashboard.
 * Returns { success: true, data } or a generic 500 (no DB text leaked).
 */
async function getTransparency(req, res) {
  try {
    const data = await getPublicStats();
    return res.json({ success: true, data });
  } catch (err) {
    // Log only a generic message — never case content (none was selected anyway).
    console.error('Transparency stats failed:', err && err.message);
    return res.status(500).json({
      success: false,
      message: 'Could not load the transparency figures. Please try again.',
    });
  }
}

module.exports = { getTransparency };
