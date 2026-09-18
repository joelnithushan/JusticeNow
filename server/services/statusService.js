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
  // the client to hide them. We select note + created_at + sender so the client
  // can label each line ("you" vs a case worker) in the two-way thread; we still
  // never select author_id, so no staff identity reaches the reporter.
  const { data: notes, error: notesError } = await supabase
    .from('case_notes')
    .select('note, created_at, sender')
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
    notes: (notes || []).map((n) => ({
      note: n.note,
      created_at: n.created_at,
      // 'staff' | 'reporter'. Default defensively to 'staff' for any legacy row
      // written before the column existed.
      sender: n.sender === 'reporter' ? 'reporter' : 'staff',
    })),
  };
}

/**
 * Post a reporter's reply on their OWN case, identified only by the reference
 * code. This is the reporter->staff half of the case thread.
 *
 * ANONYMITY: the message is stored as a case_notes row with sender='reporter',
 * author_id=NULL and is_reporter_visible=true. NOTHING identifying is written —
 * no IP, no session, no name. The reference code stays the only handle.
 *
 * NO-ORACLE: returns null when the code matches no case, so the controller can
 * answer with the SAME generic negative response it uses for a failed lookup /
 * rate-limit. A caller must not be able to tell "wrong code" from "throttled".
 *
 * The caller is responsible for validating `message` length BEFORE calling this
 * (a bad message is a client error independent of whether the code exists, so it
 * never leaks code existence).
 *
 * @param {string} referenceCode  the reporter's code (any case/whitespace)
 * @param {string} message        the already-validated, trimmed reply text
 * @returns {Promise<{note:string,created_at:string,sender:string}|null>}
 * @throws on an unexpected database error (the controller maps it to a 500).
 */
async function addReporterMessage(referenceCode, message) {
  const normalisedCode = (referenceCode || '').trim().toUpperCase();
  if (!normalisedCode) {
    return null;
  }

  // Resolve the case id from the code. Select ONLY the id — we need nothing else
  // and must not pull case content into this write path.
  const { data: caseRow, error: caseError } = await supabase
    .from('case_reports')
    .select('id')
    .eq('reference_code', normalisedCode)
    .maybeSingle();

  if (caseError) {
    // Never log the reference code. Surface as a server error (controller -> 500).
    throw new Error(`Reporter message lookup failed: ${caseError.message}`);
  }

  // No such case: null -> the controller's generic negative response.
  if (!caseRow) {
    return null;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('case_notes')
    .insert({
      case_id: caseRow.id,
      author_id: null, // no reporter identity, ever
      note: message,
      is_reporter_visible: true, // a reporter's own reply is always visible to them
      sender: 'reporter',
    })
    .select('note, created_at, sender')
    .single();

  if (insertError) {
    throw new Error(`Reporter message insert failed: ${insertError.message}`);
  }

  return {
    note: inserted.note,
    created_at: inserted.created_at,
    sender: 'reporter',
  };
}

module.exports = { getCaseByReferenceCode, addReporterMessage, SAFE_CASE_COLUMNS };
