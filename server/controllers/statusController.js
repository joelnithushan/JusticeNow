/**
 * JusticeNow — Case status controller (JNOW-11).
 *
 * ANONYMITY RULE: this controller must never read, store, or log anything
 * that could identify the reporter.  The reference code is the reporter's
 * ONLY handle on their case.
 *
 * SECURITY RULE — non-revealing 404s:
 *   An attacker must not be able to distinguish "bad format" from "valid
 *   format, no such case" by observing the response shape or timing.
 *   Both paths return exactly the same JSON body and, by skipping client-
 *   side format validation before the DB query, the same timing profile.
 */

const supabase = require('../config/supabase');

/**
 * GET /api/status/:referenceCode
 *
 * Look up a case by its reference code and return:
 *   - status           – current workflow status string
 *   - created_at       – ISO timestamp of submission (no identifying detail)
 *   - case_type        – category of the case
 *   - district         – district the case relates to
 *   - case_notes       – reporter-visible notes, ordered oldest-first
 *                        (is_reporter_visible = true only)
 *
 * Returns a generic 404 (same body and timing) for both:
 *   - a syntactically invalid code
 *   - a syntactically valid code that does not exist in the database
 * This prevents an attacker from using response differences to enumerate
 * which codes exist in the system.
 */
const getCaseStatus = async (req, res) => {
  // We intentionally do NOT validate the format of the reference code here.
  // Any format check that short-circuits before the DB query would create a
  // timing difference that reveals "invalid format" vs "not found".
  // Let Supabase handle unknown codes with a normal empty-result path.
  const { referenceCode } = req.params;

  try {
    // ---- Fetch the case report (non-identifying columns only) ----
    // description, evidence_path, assigned_org_id, etc. are deliberately
    // excluded — the reporter only needs to know their current status.
    const { data: caseData, error: caseError } = await supabase
      .from('case_reports')
      .select('id, status, created_at, case_type, district')
      .eq('reference_code', referenceCode)
      .maybeSingle(); // returns null instead of error on no match

    if (caseError) {
      console.error('Error querying case_reports for status lookup:', caseError.message);
      return res.status(500).json({
        success: false,
        message: 'Could not retrieve status. Please try again.',
      });
    }

    // No row found → return the same generic 404 regardless of why.
    // Identical body for "bad format" and "not found" prevents enumeration.
    if (!caseData) {
      return res.status(404).json({
        success: false,
        message: 'Case not found.',
      });
    }

    // ---- Fetch reporter-visible notes, oldest first ----
    // We only expose notes where is_reporter_visible = true.
    // author_id is not returned — that would identify staff.
    const { data: notesData, error: notesError } = await supabase
      .from('case_notes')
      .select('id, note, created_at')
      .eq('case_id', caseData.id)
      .eq('is_reporter_visible', true)
      .order('created_at', { ascending: true });

    if (notesError) {
      console.error('Error querying case_notes for status lookup:', notesError.message);
      return res.status(500).json({
        success: false,
        message: 'Could not retrieve status. Please try again.',
      });
    }

    // ---- Return non-identifying case data ----
    // The internal database `id` is intentionally omitted from the response.
    return res.json({
      success: true,
      data: {
        status: caseData.status,
        created_at: caseData.created_at,
        case_type: caseData.case_type,
        district: caseData.district,
        case_notes: notesData || [],
      },
    });
  } catch (err) {
    console.error('Unexpected error in getCaseStatus:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not retrieve status. Please try again.',
    });
  }
};

module.exports = { getCaseStatus };
