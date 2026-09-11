/**
 * JusticeNow — Audit trail controller (ADMIN only).
 *
 * Thin orchestration over auditService (see CLAUDE.md architecture: logic +
 * Supabase live in the service). The route guards with requireStaff THEN
 * requireRole('admin'), so by the time this runs the caller is a verified admin.
 *
 * PRIVACY: the audit `detail` carries only WHO/WHAT/WHEN metadata by
 * construction — never case content. On failure we return a generic message and
 * log only a non-sensitive line; we never log `detail`.
 */

const { listAudit } = require('../services/auditService');

/**
 * GET /api/audit — paginated, newest-first audit entries.
 * Query: ?limit=&offset=&action=
 */
async function listAuditHandler(req, res) {
  try {
    const { limit, offset, action } = req.query;
    const data = await listAudit({ limit, offset, action });
    return res.json({ success: true, data });
  } catch (err) {
    // A typed ValidationError (bad limit/offset/action) → 400 with its message.
    if (err && typeof err.status === 'number') {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    // Everything else is unexpected — log a non-sensitive line only (never detail).
    console.error('Unexpected error listing audit entries:', err && err.message);
    return res.status(500).json({
      success: false,
      message: 'Could not load the audit trail right now. Please try again.',
    });
  }
}

module.exports = { listAudit: listAuditHandler };
