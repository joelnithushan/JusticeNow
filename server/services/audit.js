/**
 * JusticeNow — Audit trail service.
 *
 * Records WHO did WHAT and WHEN for accountability. It is deliberately
 * best-effort: an audit write must NEVER block or fail the user-facing action
 * it accompanies. If the insert fails we log a non-sensitive message and move
 * on, because losing an audit row is preferable to failing a legitimate
 * status change or login.
 *
 * PRIVACY: `detail` must NEVER carry case narrative, evidence paths, reference
 * codes, or reporter PII (name/email/phone/IP). Store only non-sensitive
 * metadata such as from/to status or an org id. This module does not enforce
 * the shape of `detail`, so callers must uphold that rule — and we never log
 * `detail` itself here in case a caller gets it wrong.
 */

const supabase = require('../config/supabase');
const { AUDIT_ACTIONS } = require('../constants');

/**
 * Write one audit row. Resolves regardless of outcome (never throws into the
 * request path), EXCEPT for a programmer error: an unknown action, which
 * signals a bug at the call site and should surface in tests.
 *
 * @param {object}  params
 * @param {?string} params.caseId   related case id, or null
 * @param {?string} params.actorId  the staff member who acted, or null
 * @param {string}  params.action   one of AUDIT_ACTIONS
 * @param {?object} params.detail   non-sensitive metadata (NO PII/narrative)
 * @returns {Promise<void>}
 */
async function writeAudit({ caseId = null, actorId = null, action, detail = null }) {
  // An invalid action is a coding mistake, not a runtime condition — reject it
  // so it is caught in development rather than silently polluting the trail.
  if (!AUDIT_ACTIONS.includes(action)) {
    throw new Error(`Unknown audit action: ${action}`);
  }

  try {
    const { error } = await supabase.from('audit_log').insert({
      case_id: caseId,
      actor_id: actorId,
      action,
      detail,
    });

    if (error) {
      // Log only the action + the DB error message. Never log detail (it could
      // hold something a caller shouldn't have put there) or actor/case ids.
      console.error(`Audit write failed for action "${action}":`, error.message);
    }
  } catch (err) {
    // Swallow unexpected errors (e.g. network) — the audit trail must never
    // take down the request it is describing.
    console.error(`Audit write threw for action "${action}":`, err.message);
  }
}

module.exports = { writeAudit };
