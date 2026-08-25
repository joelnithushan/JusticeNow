/**
 * JusticeNow — Case reports controller.
 *
 * ANONYMITY RULE: this controller must never read, store or log anything
 * that could identify the reporter. No names, no emails, no phone numbers,
 * no IP addresses. The reference code is the reporter's only handle.
 */

const path = require('path');
const supabase = require('../config/supabase');
const { CASE_TYPES, CASE_STATUSES, DISTRICTS } = require('../constants');
const { generateReferenceCode } = require('../utils/referenceCode');

// How many times to retry if a generated reference code already exists.
// With 32^10 possible codes a collision is astronomically unlikely,
// but the unique constraint makes it safe to retry anyway.
const MAX_CODE_ATTEMPTS = 5;

// Supabase Storage bucket for evidence uploads.
// Create it in the dashboard: Storage -> New bucket -> "evidence" (private).
const EVIDENCE_BUCKET = 'evidence';

/**
 * POST /api/reports — submit an anonymous case report.
 *
 * Body (multipart/form-data or JSON):
 *   case_type      required, one of CASE_TYPES
 *   district       required, one of DISTRICTS
 *   description    required, non-empty text
 *   incident_date  optional, YYYY-MM-DD
 *   evidence       optional file (multipart only)
 *
 * Returns: { success, data: { reference_code } }
 */
const createReport = async (req, res) => {
  try {
    const { case_type, district, description, incident_date } = req.body;

    // ---- Validation (mirrors the CHECK constraints in docs/schema.sql) ----
    const errors = [];

    const normalisedType = (case_type || '').trim().toLowerCase();
    if (!normalisedType) {
      errors.push('case_type is required.');
    } else if (!CASE_TYPES.includes(normalisedType)) {
      errors.push(`case_type must be one of: ${CASE_TYPES.join(', ')}.`);
    }

    const trimmedDistrict = (district || '').trim();
    if (!trimmedDistrict) {
      errors.push('district is required.');
    } else if (!DISTRICTS.includes(trimmedDistrict)) {
      errors.push('district must be a valid Sri Lankan district.');
    }

    if (!description || !description.trim()) {
      errors.push('description is required and cannot be empty.');
    }

    if (incident_date && Number.isNaN(Date.parse(incident_date))) {
      errors.push('incident_date must be a valid date (YYYY-MM-DD).');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    // ---- Optional evidence upload to Supabase Storage ----
    // The stored filename is random — the original filename is discarded
    // because filenames can identify people (e.g. "statement_by_kumar.pdf").
    let evidencePath = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const storageName = `${generateReferenceCode()}${generateReferenceCode()}${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(storageName, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) {
        return res.status(500).json({
          success: false,
          message: `Evidence upload failed: ${uploadError.message}`,
        });
      }
      evidencePath = storageName;
    }

    // ---- Insert with reference-code collision retry ----
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const referenceCode = generateReferenceCode();

      const { error } = await supabase.from('case_reports').insert({
        reference_code: referenceCode,
        case_type: normalisedType,
        district: trimmedDistrict,
        description: description.trim(),
        incident_date: incident_date || null,
        evidence_path: evidencePath,
      });

      if (!error) {
        return res.status(201).json({
          success: true,
          message: 'Report received.',
          data: { reference_code: referenceCode },
        });
      }

      // 23505 = Postgres unique violation -> code collision, try a new code.
      if (error.code !== '23505') {
        console.error('Failed to insert case report:', error.message);
        return res.status(500).json({
          success: false,
          message: 'Could not save the report. Please try again.',
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Could not generate a unique reference code. Please try again.',
    });
  } catch (err) {
    console.error('Unexpected error creating report:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not save the report. Please try again.',
    });
  }
};

/**
 * GET /api/reports — list reports for staff, newest first.
 * Optional query filters: ?case_type=...&status=...
 *
 * There is no reporter identity to return — by design the table
 * simply does not contain any.
 */
const listReports = async (req, res) => {
  try {
    const { case_type, status } = req.query;

    // Validate filters so typos return a helpful 400, not an empty list.
    if (case_type && !CASE_TYPES.includes(case_type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `case_type filter must be one of: ${CASE_TYPES.join(', ')}.`,
      });
    }
    if (status && !CASE_STATUSES.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `status filter must be one of: ${CASE_STATUSES.join(', ')}.`,
      });
    }

    let query = supabase
      .from('case_reports')
      .select(
        'id, reference_code, case_type, incident_date, district, status, assigned_org_id, created_at, updated_at',
      )
      .order('created_at', { ascending: false });

    if (case_type) query = query.eq('case_type', case_type.toLowerCase());
    if (status) query = query.eq('status', status.toLowerCase());

    const { data, error } = await query;

    if (error) {
      console.error('Failed to list case reports:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Could not load reports. Please try again.',
      });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error listing reports:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not load reports. Please try again.',
    });
  }
};

// Rough UUID v4-ish check. Used to turn a malformed :id into a clean 404
// instead of letting Postgres raise a 22P02 that would surface as a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the authenticated Supabase user to a staff_users row.
 *
 * WHY: case_notes.author_id is a foreign key to staff_users(id), but the
 * authenticated user comes from Supabase Auth (a different id space). We match
 * on email — the one field both sides share. If there is no matching staff row
 * (e.g. an unseeded dev environment), we return null and the note is still
 * saved with a null author rather than failing the request.
 *
 * @returns {Promise<{id: string, name: string} | null>}
 */
const resolveStaffUser = async (email) => {
  if (!email) return null;
  const { data, error } = await supabase
    .from('staff_users')
    .select('id, name')
    .eq('email', email)
    .maybeSingle();
  if (error) {
    console.error('Failed to resolve staff user:', error.message);
    return null;
  }
  return data || null;
};

/**
 * GET /api/reports/:id — fetch a single case for the staff detail view.
 * STAFF ONLY (requireStaffAuth). Returns the full case; staff are trusted to
 * read the narrative. There is still no reporter identity to return.
 */
const getReport = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ success: false, message: 'Case not found.' });
  }

  try {
    const { data, error } = await supabase
      .from('case_reports')
      .select(
        'id, reference_code, case_type, incident_date, district, description, status, created_at, updated_at',
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch case report:', error.message);
      return res
        .status(500)
        .json({
          success: false,
          message: 'Could not load the case. Please try again.',
        });
    }
    if (!data) {
      return res.status(404).json({ success: false, message: 'Case not found.' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error fetching case report:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Could not load the case. Please try again.' });
  }
};

/**
 * PATCH /api/reports/:id/status — change a case's workflow status.
 * STAFF ONLY (requireStaffAuth).
 *
 * Per JNOW-13 we validate the new status against the allowed SET
 * (CASE_STATUSES) and apply it. NOTE: the canTransition() state-machine in
 * services/statusTransition.js (received→under_review→referred→closed, admin-
 * only reopen) is intentionally NOT enforced here — this story specifies a free
 * 4-option control and simple set-validation. Wiring canTransition + an audit
 * trail is a follow-up that needs a reliable staff role and an audit table.
 */
const updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!UUID_RE.test(id)) {
    return res.status(404).json({ success: false, message: 'Case not found.' });
  }

  const normalised = (status || '').trim().toLowerCase();
  if (!normalised || !CASE_STATUSES.includes(normalised)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of: ${CASE_STATUSES.join(', ')}.`,
    });
  }

  try {
    // Update and ask for the row back so we can 404 when nothing matched.
    const { data, error } = await supabase
      .from('case_reports')
      .update({ status: normalised, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status, updated_at')
      .maybeSingle();

    if (error) {
      console.error('Failed to update case status:', error.message);
      return res
        .status(500)
        .json({
          success: false,
          message: 'Could not update the status. Please try again.',
        });
    }
    if (!data) {
      return res.status(404).json({ success: false, message: 'Case not found.' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error updating case status:', err);
    return res
      .status(500)
      .json({
        success: false,
        message: 'Could not update the status. Please try again.',
      });
  }
};

/**
 * POST /api/reports/:id/notes — add a dated note to a case.
 * STAFF ONLY (requireStaffAuth).
 *
 * Body: { note: string, is_reporter_visible?: boolean }
 * is_reporter_visible defaults to FALSE (internal). A note is only ever shown
 * to the anonymous reporter when this is explicitly true — the default must
 * stay false so an internal aside can never surface by accident.
 */
const addNote = async (req, res) => {
  const { id } = req.params;
  const { note, is_reporter_visible } = req.body;

  if (!UUID_RE.test(id)) {
    return res.status(404).json({ success: false, message: 'Case not found.' });
  }
  if (!note || !note.trim()) {
    return res
      .status(400)
      .json({ success: false, message: 'note is required and cannot be empty.' });
  }

  // Coerce to a strict boolean — anything other than an explicit true is
  // treated as internal. Never trust the client to send a real boolean.
  const isReporterVisible =
    is_reporter_visible === true || is_reporter_visible === 'true';

  try {
    // Attribute the note to the signed-in staff member where we can (see
    // resolveStaffUser). author_id may be null in an unseeded environment.
    const staff = await resolveStaffUser(req.staffUser?.email);

    const { data, error } = await supabase
      .from('case_notes')
      .insert({
        case_id: id,
        author_id: staff?.id ?? null,
        note: note.trim(),
        is_reporter_visible: isReporterVisible,
      })
      .select('id, note, is_reporter_visible, created_at, author_id')
      .maybeSingle();

    if (error) {
      // 23503 = foreign-key violation → the case_id does not exist.
      if (error.code === '23503') {
        return res.status(404).json({ success: false, message: 'Case not found.' });
      }
      console.error('Failed to add case note:', error.message);
      return res
        .status(500)
        .json({
          success: false,
          message: 'Could not save the note. Please try again.',
        });
    }

    return res.status(201).json({
      success: true,
      data: { ...data, author_name: staff?.name ?? null },
    });
  } catch (err) {
    console.error('Unexpected error adding case note:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Could not save the note. Please try again.' });
  }
};

/**
 * GET /api/reports/:id/notes — list a case's notes, newest first.
 * STAFF ONLY (requireStaffAuth) — this returns INTERNAL notes too, so it must
 * never be reachable by an anonymous caller. (The reporter-facing lookup lives
 * in statusController and returns only reporter-visible notes.)
 */
const listNotes = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ success: false, message: 'Case not found.' });
  }

  try {
    // Embed the author's name via the author_id -> staff_users FK.
    const { data, error } = await supabase
      .from('case_notes')
      .select('id, note, is_reporter_visible, created_at, author:staff_users(name)')
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to list case notes:', error.message);
      return res
        .status(500)
        .json({
          success: false,
          message: 'Could not load the notes. Please try again.',
        });
    }

    // Flatten the embedded author into a plain author_name for the client.
    const notes = (data || []).map(({ author, ...n }) => ({
      ...n,
      author_name: author?.name ?? null,
    }));
    return res.json({ success: true, data: notes });
  } catch (err) {
    console.error('Unexpected error listing case notes:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Could not load the notes. Please try again.' });
  }
};

module.exports = {
  createReport,
  listReports,
  getReport,
  updateStatus,
  addNote,
  listNotes,
};
