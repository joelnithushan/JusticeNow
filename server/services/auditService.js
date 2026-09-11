/**
 * JusticeNow — Audit trail read service (ADMIN only).
 *
 * Owns all Supabase access for READING the append-only audit trail. Writing is a
 * separate concern (services/audit.js writeAudit) — this module never mutates.
 *
 * AUTHORIZATION BOUNDARY: the audit trail is ADMIN-ONLY (see CLAUDE.md
 * authorization matrix — "Analytics and audit trail" is admin, with analytics
 * also available to the dashboard; the full trail is admin). The guard lives at
 * the route (requireStaff THEN requireRole('admin')), not here — this service
 * assumes an authorised admin caller.
 *
 * PRIVACY / ANONYMITY: `detail` is stored by construction with ONLY WHO/WHAT/WHEN
 * metadata (from/to status, org id, visibility flag) — never case narrative,
 * notes, evidence paths, reference codes or reporter PII (there is no reporter
 * identity anywhere in the data model to leak). We therefore pass `detail`
 * through as stored and DO NOT invent or enrich case content. The only enrichment
 * is joining actor_id → staff name and case_id → reference_code, both of which are
 * non-sensitive staff/case handles. We never log `detail`.
 */

const supabase = require('../config/supabase');
const { AUDIT_ACTIONS } = require('../constants');

// Default and maximum page sizes. The max caps a single response so a caller
// cannot pull the entire trail in one request (and to keep the payload bounded).
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * A validation error the controller maps to a 400 (mirrors caseService).
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

// The audit columns returned to the client. Explicitly listed (never `*`) so a
// future column cannot leak by accident.
const AUDIT_COLUMNS = 'id, case_id, actor_id, action, detail, created_at';

/**
 * Coerce a raw query value to a bounded, integer limit.
 * @param {*} raw
 * @returns {number} between 1 and MAX_LIMIT
 * @throws {ValidationError} on a non-numeric / out-of-range value
 */
function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_LIMIT;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError('limit must be a positive integer.');
  }
  // Clamp rather than reject an over-large limit — a friendlier contract that
  // still bounds the response.
  return Math.min(n, MAX_LIMIT);
}

/**
 * Coerce a raw query value to a non-negative integer offset.
 * @param {*} raw
 * @returns {number} >= 0
 * @throws {ValidationError} on a non-numeric / negative value
 */
function parseOffset(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return 0;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ValidationError('offset must be a non-negative integer.');
  }
  return n;
}

/**
 * Batch-lookup staff names for a set of actor ids. Returns a Map of id → name.
 * A null/unknown actor (system action, or a since-deleted staff row via
 * ON DELETE SET NULL) is simply absent from the map → the caller maps it to null.
 *
 * @param {Array<?string>} actorIds
 * @returns {Promise<Map<string, string>>}
 */
async function loadActorNames(actorIds) {
  const uniqueIds = [...new Set(actorIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('staff_users')
    .select('id, name')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`Audit actor-name lookup failed: ${error.message}`);
  }

  return new Map((data || []).map((s) => [s.id, s.name]));
}

/**
 * Batch-lookup case reference codes for a set of case ids. Returns a Map of
 * id → reference_code. The reference_code is a case HANDLE, not reporter
 * identity — it is safe to show an admin here (and admins already see it in the
 * case list). A null/unknown case id is absent → the caller maps it to null.
 *
 * @param {Array<?string>} caseIds
 * @returns {Promise<Map<string, string>>}
 */
async function loadCaseReferences(caseIds) {
  const uniqueIds = [...new Set(caseIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('case_reports')
    .select('id, reference_code')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`Audit case-reference lookup failed: ${error.message}`);
  }

  return new Map((data || []).map((c) => [c.id, c.reference_code]));
}

/**
 * List audit entries, newest first, enriched with the actor's name and the
 * case's reference code, paginated by offset/limit.
 *
 * @param {object} params
 * @param {*} [params.limit]   requested page size (default 50, max 100)
 * @param {*} [params.offset]  rows to skip (default 0)
 * @param {?string} [params.action]  optional filter, must be one of AUDIT_ACTIONS
 * @returns {Promise<{ entries: object[], has_more: boolean }>}
 * @throws {ValidationError} on a bad limit/offset/action
 */
async function listAudit({ limit, offset, action } = {}) {
  const parsedLimit = parseLimit(limit);
  const parsedOffset = parseOffset(offset);

  // Validate the optional action filter against the shared list — a typo is a
  // client error (400), not an empty result that looks like "no activity".
  let actionFilter = null;
  if (action !== undefined && action !== null && action !== '') {
    if (!AUDIT_ACTIONS.includes(action)) {
      throw new ValidationError(
        `action must be one of: ${AUDIT_ACTIONS.join(', ')}.`,
      );
    }
    actionFilter = action;
  }

  // Fetch ONE extra row (limit + 1) to detect whether another page exists without
  // a separate count query. We return only `parsedLimit` rows and use the
  // presence of the extra one as `has_more`.
  const rangeStart = parsedOffset;
  const rangeEnd = parsedOffset + parsedLimit; // inclusive → pulls parsedLimit + 1 rows

  let query = supabase
    .from('audit_log')
    .select(AUDIT_COLUMNS)
    .order('created_at', { ascending: false })
    .range(rangeStart, rangeEnd);

  if (actionFilter) {
    query = query.eq('action', actionFilter);
  }

  const { data, error } = await query;

  if (error) {
    // Surface a DB failure so the controller returns a 500. The message carries
    // only the DB error text — never `detail` (which we do not even reference here).
    throw new Error(`Audit list failed: ${error.message}`);
  }

  const rows = data || [];
  const hasMore = rows.length > parsedLimit;
  // Drop the probe row so the caller sees exactly the page they asked for.
  const pageRows = hasMore ? rows.slice(0, parsedLimit) : rows;

  const [actorNames, caseReferences] = await Promise.all([
    loadActorNames(pageRows.map((r) => r.actor_id)),
    loadCaseReferences(pageRows.map((r) => r.case_id)),
  ]);

  const entries = pageRows.map((r) => ({
    id: r.id,
    action: r.action,
    actor_id: r.actor_id,
    actor_name: r.actor_id ? actorNames.get(r.actor_id) || null : null,
    case_id: r.case_id,
    case_reference: r.case_id ? caseReferences.get(r.case_id) || null : null,
    // Pass `detail` through as stored — it holds only WHO/WHAT metadata by
    // construction (see file header). We never rewrite or enrich it.
    detail: r.detail ?? null,
    created_at: r.created_at,
  }));

  return { entries, has_more: hasMore };
}

module.exports = {
  listAudit,
  ValidationError,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  AUDIT_COLUMNS,
};
