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
      .select('id, reference_code, case_type, incident_date, district, status, assigned_org_id, created_at, updated_at')
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

module.exports = { createReport, listReports };
