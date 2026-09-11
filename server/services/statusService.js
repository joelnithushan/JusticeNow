/**
 * JusticeNow — Anonymous status lookup service.
 *
 * Owns the ONE query an anonymous reporter is allowed to make: read a single
 * case by its reference code, plus the notes staff have chosen to show them.
 *
 * SERVER-SIDE FILTERING (authorization matrix): an anonymous reporter may see
 * their case status and reporter-visible notes, but NOT the narrative
 * (`description`), evidence (`evidence_path`), internal notes
 * (`is_reporter_visible = false`), the assigned org, or any note author. That
 * filtering happens HERE, in the SELECT column lists and the note query filter —
 * never in the client. We select only the safe columns so an excluded field can
 * never be present in the returned object to leak by accident.
 *
 * PRIVACY: never log the reference code, notes, or any case content.
 */

const supabase = require('../config/supabase');

// The ONLY case columns an anonymous reporter may receive back on a lookup. All
// of these are things the reporter THEMSELVES provided or coarse workflow state.
// Note what is absent and MUST stay absent: description (narrative),
// people_involved, victim_information, witness_details, additional_information,
// evidence_path, assigned_org_id — these are not re-exposed via a code lookup so
// a leaked code reveals as little as possible.
const SAFE_CASE_COLUMNS =
  'id, reference_code, case_type, custom_category, title, district, location_name, ' +
  'incident_date, incident_date_approximate, incident_time, incident_time_approximate, ' +
  'immediate_risk, assistance_requested, status, created_at, updated_at';

/**
 * Look up a single case by reference code and assemble the safe projection.
 *
 * @param {string} referenceCode  the reporter's code (any case/whitespace)
 * @returns {Promise<object|null>} the safe case object, or null if not found.
 * @throws on an unexpected database error (the controller maps it to a 500).
 */
async function getCaseByReferenceCode(referenceCode) {
  // Normalise the way the code is generated (uppercase, trimmed). A reporter may
  // type it in lower case or with stray spaces from copying it off paper.
  const normalisedCode = (referenceCode || '').trim().toUpperCase();
  if (!normalisedCode) {
    return null;
  }

  const { data: caseRow, error: caseError } = await supabase
    .from('case_reports')
    .select(SAFE_CASE_COLUMNS)
    .eq('reference_code', normalisedCode)
    .maybeSingle();

  if (caseError) {
    // A DB failure is a server problem — surface it so the controller returns a
    // 500. Do NOT log the reference code.
    throw new Error(`Status lookup failed: ${caseError.message}`);
  }

  // Not found. The controller turns this into the generic 404 (same as the
  // rate-limited response), so a valid-but-nonexistent code reveals nothing.
  if (!caseRow) {
    return null;
  }

  // Fetch ONLY reporter-visible notes. The is_reporter_visible = true filter is
  // the server-side authorisation boundary for internal notes — never rely on
  // the client to hide them. We select just note + created_at so a note's
  // author_id can never reach the reporter.
  const { data: notes, error: notesError } = await supabase
    .from('case_notes')
    .select('note, created_at')
    .eq('case_id', caseRow.id)
    .eq('is_reporter_visible', true)
    .order('created_at', { ascending: true }); // oldest -> newest timeline

  if (notesError) {
    throw new Error(`Status notes lookup failed: ${notesError.message}`);
  }

  // Assemble the safe object. `id` is used only to fetch notes; it is not part
  // of the public projection, so it is dropped here.
  return {
    reference_code: caseRow.reference_code,
    case_type: caseRow.case_type,
    custom_category: caseRow.custom_category,
    title: caseRow.title,
    district: caseRow.district,
    location_name: caseRow.location_name,
    incident_date: caseRow.incident_date,
    incident_date_approximate: caseRow.incident_date_approximate,
    incident_time: caseRow.incident_time,
    incident_time_approximate: caseRow.incident_time_approximate,
    immediate_risk: caseRow.immediate_risk,
    assistance_requested: caseRow.assistance_requested || [],
    status: caseRow.status,
    created_at: caseRow.created_at,
    updated_at: caseRow.updated_at,
    notes: (notes || []).map((n) => ({ note: n.note, created_at: n.created_at })),
  };
}

module.exports = { getCaseByReferenceCode, SAFE_CASE_COLUMNS };
