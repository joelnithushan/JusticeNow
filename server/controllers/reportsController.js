/**
 * JusticeNow — Case reports controller.
 *
 * ANONYMITY RULE: this controller must never read, store or log anything
 * that could identify the reporter. No names, no emails, no phone numbers,
 * no IP addresses. The reference code is the reporter's only handle.
 */

const path = require('path');
const supabase = require('../config/supabase');
const {
  CASE_TYPES,
  CASE_STATUSES,
  DISTRICTS,
  REPORTER_TYPES,
  ASSISTANCE_TYPES,
  TRISTATE,
  PRIOR_REPORT_SOURCES,
} = require('../constants');
const { generateReferenceCode } = require('../utils/referenceCode');
const { stripEvidenceMetadata } = require('../utils/evidenceMetadata');
const { writeAudit } = require('../services/audit');
const caseService = require('../services/caseService');

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
    const b = req.body || {};

    // Field helpers. Multipart sends everything as strings, so coerce carefully.
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const optStr = (v) => str(v) || null;
    const bool = (v) => v === true || v === 'true' || v === '1';
    const parseArray = (v) => {
      if (Array.isArray(v)) return v.map((x) => String(x).trim());
      const s = str(v);
      if (!s) return [];
      try {
        const p = JSON.parse(s);
        if (Array.isArray(p)) return p.map((x) => String(x).trim());
      } catch {
        /* not JSON — fall through to CSV */
      }
      return s.split(',').map((x) => x.trim()).filter(Boolean);
    };

    // ---- Validation. MANDATORY per spec: reporter type, category, description.
    // Everything else is optional (data minimisation). District/location are NOT
    // forced. Controlled fields are validated ONLY when present. ----
    const errors = [];

    // reporter_type is mandatory in the mobile UI, but we DEFAULT it server-side
    // (rather than 400) so existing clients that don't send it keep working
    // during the rollout. Present-but-invalid is still rejected.
    const reporterType = str(b.reporter_type) || 'prefer_not_to_say';
    if (!REPORTER_TYPES.includes(reporterType)) {
      errors.push(`reporter_type must be one of: ${REPORTER_TYPES.join(', ')}.`);
    }

    const normalisedType = str(b.case_type).toLowerCase();
    if (!normalisedType) {
      errors.push('case_type is required.');
    } else if (!CASE_TYPES.includes(normalisedType)) {
      errors.push(`case_type must be one of: ${CASE_TYPES.join(', ')}.`);
    }

    if (!str(b.description)) {
      errors.push('description is required and cannot be empty.');
    }

    // District is now OPTIONAL; validate only if provided.
    const trimmedDistrict = str(b.district);
    if (trimmedDistrict && !DISTRICTS.includes(trimmedDistrict)) {
      errors.push('district must be a valid Sri Lankan district.');
    }

    if (b.incident_date && Number.isNaN(Date.parse(b.incident_date))) {
      errors.push('incident_date must be a valid date (YYYY-MM-DD).');
    }

    // Controlled small fields — validated only when present.
    const immediateRisk = optStr(b.immediate_risk);
    if (immediateRisk && !TRISTATE.includes(immediateRisk)) {
      errors.push('immediate_risk is invalid.');
    }
    const otherWitnesses = optStr(b.other_witnesses);
    if (otherWitnesses && !TRISTATE.includes(otherWitnesses)) {
      errors.push('other_witnesses is invalid.');
    }
    const previouslyReported = optStr(b.previously_reported);
    if (previouslyReported && !PRIOR_REPORT_SOURCES.includes(previouslyReported)) {
      errors.push('previously_reported is invalid.');
    }
    // assistance_requested: keep only recognised values (silently drop unknowns).
    const assistance = parseArray(b.assistance_requested).filter((a) =>
      ASSISTANCE_TYPES.includes(a),
    );

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    // Title: use the reporter's, else auto-derive a short one from the narrative.
    const description = str(b.description);
    const derivedTitle = description.length > 60 ? `${description.slice(0, 57)}…` : description;
    const title = str(b.title) || derivedTitle;

    // ---- Optional evidence upload to Supabase Storage ----
    // The stored filename is random — the original filename is discarded
    // because filenames can identify people (e.g. "statement_by_kumar.pdf").
    let evidencePath = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const storageName = `${generateReferenceCode()}${generateReferenceCode()}${ext}`;

      // Strip identifying metadata (EXIF/GPS, XMP, comments, PDF info) BEFORE the
      // file leaves this server — a photo's embedded GPS/serial/timestamp could
      // otherwise deanonymise the reporter. Best-effort: on a parse failure the
      // original bytes are returned so a valid report is never blocked.
      const cleanBuffer = await stripEvidenceMetadata(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      );

      const { error: uploadError } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(storageName, cleanBuffer, {
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
        reporter_type: reporterType,
        case_type: normalisedType,
        custom_category: normalisedType === 'other' ? optStr(b.custom_category) : null,
        title,
        description,
        people_involved: optStr(b.people_involved),
        victim_information: optStr(b.victim_information),
        incident_date: b.incident_date || null,
        incident_date_approximate: bool(b.incident_date_approximate),
        incident_time: optStr(b.incident_time),
        incident_time_approximate: bool(b.incident_time_approximate),
        district: trimmedDistrict || null,
        location_name: optStr(b.location_name),
        evidence_path: evidencePath,
        evidence_description: optStr(b.evidence_description),
        other_witnesses: otherWitnesses,
        witness_details: optStr(b.witness_details),
        immediate_risk: immediateRisk,
        previously_reported: previouslyReported,
        previous_report_details: optStr(b.previous_report_details),
        assistance_requested: assistance,
        additional_information: optStr(b.additional_information),
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

    // ORG-SCOPING (server is the authorization boundary): the platform admin
    // sees every case, including UNASSIGNED ones (assigned_org_id is null) so it
    // can route them. Every other role (org_admin/attorney/officer) sees ONLY
    // cases assigned to their own org — never another org's cases, and never the
    // unassigned queue. Enforced here in the query, not the client.
    if (req.staff.role !== 'admin') {
      query = query.eq('assigned_org_id', req.staff.org);
    }

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

/**
 * Map a service error to an HTTP response. ValidationError -> 400,
 * NotFoundError -> 404, ForbiddenError -> 403; anything else is an unexpected
 * server error -> 500. Never leaks stack traces or DB text (per CLAUDE.md).
 */
const respondServiceError = (res, err, fallbackMessage) => {
  if (err && typeof err.status === 'number') {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  // Log a non-sensitive message only — never the case content or ids.
  console.error(fallbackMessage, err && err.message);
  return res.status(500).json({ success: false, message: fallbackMessage });
};

/**
 * GET /api/reports/:id — staff full view of one case.
 *
 * requireStaff has already run (see routes/reports.js), so req.staff is set.
 * Returns the full case, ALL notes (internal + reporter-visible), a short-lived
 * signed evidence URL (never the raw path), the assigned org, and the set of
 * status transitions this staff role may perform.
 */
const getCase = async (req, res) => {
  try {
    // Pass the whole req.staff so the service enforces org-scoping (role+org),
    // not just role. A non-platform-admin sees only their own org's cases.
    const data = await caseService.getCaseDetail(req.params.id, req.staff);
    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(res, err, 'Could not load the case. Please try again.');
  }
};

/**
 * POST /api/reports/:id/notes — add a note (internal or reporter-visible).
 *
 * AUDIT: writes a note_added entry. The detail carries ONLY the visibility flag
 * — NEVER the note text (that is case content, and must never reach the audit
 * trail or logs).
 */
const addCaseNote = async (req, res) => {
  try {
    const { note, is_reporter_visible } = req.body;
    const created = await caseService.addNote({
      caseId: req.params.id,
      authorId: req.staff.id,
      note,
      isReporterVisible: is_reporter_visible,
      caller: req.staff, // org-scope guard: only own-org cases
    });

    await writeAudit({
      caseId: req.params.id,
      actorId: req.staff.id,
      action: 'note_added',
      // Only WHO/WHAT/WHEN metadata — the note text is deliberately excluded.
      detail: { is_reporter_visible: created.is_reporter_visible },
    });

    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    return respondServiceError(res, err, 'Could not add the note. Please try again.');
  }
};

/**
 * PATCH /api/reports/:id/status — move a case through the state machine.
 *
 * The service calls the canonical canTransition() guard and enforces the
 * "reason required for a backward move" rule. AUDIT: writes status_changed with
 * from/to and the reason (a justification, not case content) — safe metadata.
 */
const changeCaseStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;
    const result = await caseService.changeStatus({
      caseId: req.params.id,
      status,
      reason,
      role: req.staff.role,
      caller: req.staff, // org-scope guard: only own-org cases
    });

    await writeAudit({
      caseId: req.params.id,
      actorId: req.staff.id,
      action: 'status_changed',
      detail: { from: result.from, to: result.to, reason: result.reason },
    });

    return res.json({ success: true, data: { status: result.status } });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not change the status. Please try again.',
    );
  }
};

/**
 * PATCH /api/reports/:id/assign — assign or unassign a case to an org.
 *
 * AUDIT: writes case_assigned with the org id (or null) — safe metadata.
 */
const assignCase = async (req, res) => {
  try {
    const { assigned_org_id } = req.body;
    const result = await caseService.assignCase({
      caseId: req.params.id,
      assignedOrgId: assigned_org_id ?? null,
      caller: req.staff, // org-scope guard: only own-org cases
    });

    await writeAudit({
      caseId: req.params.id,
      actorId: req.staff.id,
      action: 'case_assigned',
      detail: { assigned_org_id: result.assigned_org_id },
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not assign the case. Please try again.',
    );
  }
};

module.exports = {
  createReport,
  listReports,
  getCase,
  addCaseNote,
  changeCaseStatus,
  assignCase,
};
