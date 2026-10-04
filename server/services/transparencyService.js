/**
 * JusticeNow — Public transparency service.
 *
 * Produces the PUBLIC, fully-anonymised aggregate figures shown on the open
 * transparency dashboard (accountability is the heart of SDG 16). Anyone can
 * read these — no authentication — so the output must contain ONLY coarse,
 * non-identifying counts.
 *
 * ANONYMITY (by construction):
 *  - We reuse getAnalytics() with NO caller, which selects ONLY status,
 *    case_type, district, created_at and returns pure counts — never a row id,
 *    reference code, narrative, or evidence path (there is no reporter identity
 *    in case_reports to leak in the first place).
 *  - Only SINGLE-DIMENSION breakdowns are exposed (by status, by type, by
 *    district, by month). We deliberately do NOT cross-tabulate (e.g. type ×
 *    district × month), because a cell with a count of one in a small area could
 *    edge toward re-identification. Coarse marginals cannot.
 *
 * PRIVACY: never log case content. This module logs nothing.
 */

const supabase = require('../config/supabase');
const { getAnalytics } = require('./analyticsService');

// A tiny in-memory cache: the public endpoint is unauthenticated and cacheable,
// and the figures barely move minute-to-minute. This shields the DB from being
// hammered by refreshes/bots without adding infrastructure. Not shared across
// processes — that's fine for a single-node dev/demo server.
const CACHE_TTL_MS = 30_000;
let cache = { data: null, expires: 0 };

/**
 * Statuses that count as "resolved" for the headline resolution rate. `referred`
 * means the case reached a legal-aid org; `closed` is terminal. Both represent a
 * case that moved beyond the initial queue.
 */
const RESOLVED_STATUSES = ['referred', 'closed'];

/**
 * Build the public transparency payload.
 *
 * @param {number} [now]  epoch ms (injectable for tests); defaults to Date.now().
 * @returns {Promise<object>} anonymised aggregate figures + a generated_at stamp.
 */
async function getPublicStats(now = Date.now()) {
  // Skip the cache under test so each assertion sees a fresh aggregation
  // (test files may hold a different module instance than the running app).
  const useCache = process.env.NODE_ENV !== 'test';
  if (useCache && cache.data && now < cache.expires) {
    return cache.data;
  }

  // Platform-wide aggregates (no caller → no org scoping). Aggregate-only.
  const analytics = await getAnalytics();

  // Count ACTIVE organisations (a public, non-sensitive figure — the same orgs
  // the public directory lists). head:true fetches just the count, no rows.
  const { count: orgCount, error: orgError } = await supabase
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (orgError) {
    throw new Error(`Transparency org count failed: ${orgError.message}`);
  }

  const total = analytics.total;
  const resolved = RESOLVED_STATUSES.reduce(
    (sum, s) => sum + (analytics.by_status[s] || 0),
    0,
  );
  // Rate as a 0..1 fraction; the client formats the percentage.
  const resolutionRate = total > 0 ? resolved / total : 0;

  const data = {
    total,
    resolved,
    resolution_rate: resolutionRate,
    organisations: orgCount || 0,
    by_status: analytics.by_status,
    by_case_type: analytics.by_case_type,
    by_district: analytics.by_district,
    recent_by_month: analytics.recent_by_month,
    median_resolution_days: await getMedianResolutionDays(),
    generated_at: new Date(now).toISOString(),
  };

  if (useCache) {
    cache = { data, expires: now + CACHE_TTL_MS };
  }
  return data;
}

/**
 * Median days from a case being created to it FIRST reaching a resolved status
 * (referred or closed). A headline accountability figure for SDG 16: "how long,
 * typically, until a case is acted on".
 *
 * ANONYMITY: this reads case_reports.id + created_at and audit_log rows, but the
 * OUTPUT is a single aggregate number — never a per-case duration, id, or date.
 * case_reports.id is a row key, not reporter identity (there is none to leak).
 * We use the MEDIAN, not the mean, so one extreme case can't skew the figure and
 * it never approaches a value that could single out an individual case.
 *
 * @returns {Promise<number|null>} median days (one decimal), or null if nothing
 *          has been resolved yet.
 */
async function getMedianResolutionDays() {
  const { data: cases, error: caseErr } = await supabase
    .from('case_reports')
    .select('id, created_at');
  if (caseErr) {
    throw new Error(`Transparency resolution (cases) failed: ${caseErr.message}`);
  }
  if (!cases || cases.length === 0) return null;

  const createdById = new Map(
    cases.map((c) => [c.id, new Date(c.created_at).getTime()]),
  );

  // Every status transition writes an audit row with detail.to = new status.
  const { data: events, error: evErr } = await supabase
    .from('audit_log')
    .select('case_id, detail, created_at')
    .eq('action', 'status_changed');
  if (evErr) {
    throw new Error(`Transparency resolution (audit) failed: ${evErr.message}`);
  }
  if (!events || events.length === 0) return null;

  // Earliest moment each case reached a resolved status.
  const resolvedAtById = new Map();
  for (const e of events) {
    // detail is jsonb (object) in normal operation, but tolerate a text column.
    const detail = typeof e.detail === 'string' ? safeParseDetail(e.detail) : e.detail;
    if (!detail || !RESOLVED_STATUSES.includes(detail.to)) continue;
    const ts = new Date(e.created_at).getTime();
    const existing = resolvedAtById.get(e.case_id);
    if (existing === undefined || ts < existing) resolvedAtById.set(e.case_id, ts);
  }

  const durationsDays = [];
  for (const [caseId, resolvedTs] of resolvedAtById) {
    const createdTs = createdById.get(caseId);
    if (createdTs === undefined) continue;
    const days = (resolvedTs - createdTs) / 86_400_000;
    if (days >= 0) durationsDays.push(days);
  }
  if (durationsDays.length === 0) return null;

  durationsDays.sort((a, b) => a - b);
  const mid = Math.floor(durationsDays.length / 2);
  const median =
    durationsDays.length % 2 === 0
      ? (durationsDays[mid - 1] + durationsDays[mid]) / 2
      : durationsDays[mid];
  return Math.round(median * 10) / 10;
}

function safeParseDetail(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Clear the cache (used by tests so each assertion sees a fresh aggregation). */
function _clearCache() {
  cache = { data: null, expires: 0 };
}

module.exports = { getPublicStats, getMedianResolutionDays, RESOLVED_STATUSES, _clearCache };
