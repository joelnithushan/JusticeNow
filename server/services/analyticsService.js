/**
 * JusticeNow — Analytics aggregation service.
 *
 * Produces the AGGREGATE dashboard figures for staff: how many cases exist, and
 * how they break down by status, case type, district, and recent monthly volume.
 *
 * ANONYMITY (by construction): this service is aggregate-ONLY. It fetches just
 * the four non-identifying columns it needs to count — status, case_type,
 * district, created_at — and NEVER the narrative (`description`) or evidence
 * (`evidence_path`). Those must not be pulled into memory or logs, and there is
 * no reporter identity anywhere in case_reports to leak. The output is pure
 * counts: no row, id, reference code, or free text ever leaves this module.
 *
 * PRIVACY: never log case content. This module logs nothing.
 */

const supabase = require('../config/supabase');
const { CASE_STATUSES, CASE_TYPES, DISTRICTS } = require('../constants');

// The ONLY columns analytics needs. Deliberately excludes description and
// evidence_path — counting never requires case content, so we never read it.
const AGGREGATE_COLUMNS = 'status, case_type, district, created_at';

// How many trailing calendar months the recent-volume series covers, INCLUDING
// the current month. Six gives a readable half-year trend on a small screen.
const RECENT_MONTHS = 6;

/**
 * Build an object mapping every value in `keys` to 0. Seeding zeros up front
 * guarantees the response includes empty buckets (e.g. a status with no cases),
 * so the client can render a complete, stable set of bars rather than a
 * whichever-happened-to-occur subset.
 *
 * @param {readonly string[]} keys
 * @returns {Object<string, number>}
 */
function zeroedCounts(keys) {
  const counts = {};
  for (const key of keys) {
    counts[key] = 0;
  }
  return counts;
}

/**
 * Format a Date as a 'YYYY-MM' month key (UTC). We key on UTC so month bucketing
 * is stable regardless of server timezone — created_at is stored as timestamptz.
 *
 * @param {Date} date
 * @returns {string}
 */
function monthKey(date) {
  const year = date.getUTCFullYear();
  // getUTCMonth() is 0-based; pad to two digits for a sortable 'YYYY-MM'.
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Build the ordered list of the last RECENT_MONTHS month keys (oldest → newest),
 * ending with the current month. Returned as pre-seeded {month, count:0} entries
 * so months with no cases still appear on the trend line.
 *
 * @returns {{ month: string, count: number }[]}
 */
function buildRecentMonths() {
  const now = new Date();
  const months = [];
  // Walk backwards from the current month so the oldest ends up first once
  // reversed. Constructing each month at day 1 UTC avoids end-of-month rollover
  // bugs (e.g. subtracting a month from the 31st).
  for (let offset = RECENT_MONTHS - 1; offset >= 0; offset--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({ month: monthKey(d), count: 0 });
  }
  return months;
}

/**
 * Fetch and aggregate case-report figures into the dashboard shape.
 *
 * @returns {Promise<{
 *   total: number,
 *   by_status: Object<string, number>,
 *   by_case_type: Object<string, number>,
 *   by_district: Object<string, number>,
 *   recent_by_month: { month: string, count: number }[],
 * }>}
 * @throws on an unexpected database error (the controller maps it to a 500).
 */
async function getAnalytics(caller) {
  let query = supabase.from('case_reports').select(AGGREGATE_COLUMNS);

  // Org-scoping: the PLATFORM admin sees figures across every organisation; any
  // other role (org_admin/attorney/officer) sees ONLY cases assigned to their
  // own org, so a dashboard never leaks another organisation's volume.
  if (caller && caller.role !== 'admin') {
    query = query.eq('assigned_org_id', caller.org);
  }

  const { data, error } = await query;

  if (error) {
    // Surface a DB failure so the controller returns a 500. The message carries
    // only the DB error text (no case content, which we never selected anyway).
    throw new Error(`Analytics aggregation failed: ${error.message}`);
  }

  const rows = data || [];

  // Seed zero buckets for every known value so the response is complete and the
  // client can render a stable set of bars including empty categories.
  const byStatus = zeroedCounts(CASE_STATUSES);
  const byCaseType = zeroedCounts(CASE_TYPES);
  // Districts: seed all zeros, then DROP the zero buckets at the end. Sri Lanka
  // has 25 districts; most dashboards only care about the ones with cases, so we
  // return only district counts > 0 to keep the payload compact. (Documented in
  // the API interface on the client side.)
  const byDistrict = zeroedCounts(DISTRICTS);

  const recentMonths = buildRecentMonths();
  // Index the recent-month buckets by key for O(1) lookup while scanning rows.
  const recentByKey = new Map(recentMonths.map((m) => [m.month, m]));

  for (const row of rows) {
    // Only count values we recognise. An unexpected value (should be impossible
    // given the DB CHECK constraints) is ignored rather than creating a stray
    // bucket the client cannot label.
    if (row.status in byStatus) {
      byStatus[row.status] += 1;
    }
    if (row.case_type in byCaseType) {
      byCaseType[row.case_type] += 1;
    }
    if (row.district in byDistrict) {
      byDistrict[row.district] += 1;
    }

    if (row.created_at) {
      const parsed = new Date(row.created_at);
      if (!Number.isNaN(parsed.getTime())) {
        const bucket = recentByKey.get(monthKey(parsed));
        // Only the last RECENT_MONTHS have buckets; older rows fall outside the
        // window and are simply not counted in the trend (they still count in
        // total and the other breakdowns).
        if (bucket) {
          bucket.count += 1;
        }
      }
    }
  }

  // Compact the district map to only non-zero entries (see the note above).
  const byDistrictCompact = {};
  for (const district of DISTRICTS) {
    if (byDistrict[district] > 0) {
      byDistrictCompact[district] = byDistrict[district];
    }
  }

  return {
    total: rows.length,
    by_status: byStatus,
    by_case_type: byCaseType,
    by_district: byDistrictCompact,
    recent_by_month: recentMonths,
  };
}

module.exports = { getAnalytics, RECENT_MONTHS, AGGREGATE_COLUMNS };
