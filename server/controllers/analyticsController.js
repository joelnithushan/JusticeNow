/**
 * JusticeNow — Analytics controller.
 *
 * Thin orchestration over analyticsService (see CLAUDE.md architecture: logic +
 * Supabase live in the service). Available to ALL staff roles (the route guards
 * with requireStaff) — analytics is the "dashboard only" figure in the
 * authorization matrix, not admin-only.
 *
 * PRIVACY: the aggregate shape contains only counts — no case content, no
 * reporter identity (none exists). On failure we return a generic message and
 * log only a non-sensitive line; we never log case content (there is none here).
 */

const { getAnalytics } = require('../services/analyticsService');

/**
 * GET /api/analytics — aggregate dashboard counts.
 */
async function getAnalyticsHandler(req, res) {
  try {
    // Pass the caller so the service scopes figures to their org (platform admin
    // sees everything; org staff see only their own organisation's cases).
    const data = await getAnalytics(req.staff);
    return res.json({ success: true, data });
  } catch (err) {
    // Log a non-sensitive message only — never case content (none is fetched).
    console.error('Unexpected error building analytics:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Could not load analytics right now. Please try again.',
    });
  }
}

module.exports = { getAnalytics: getAnalyticsHandler };
