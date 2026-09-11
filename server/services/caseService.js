/**
 * JusticeNow — Staff case-detail service.
 *
 * Owns all Supabase access for the STAFF full view of a single case: the full
 * case row, ALL notes (internal + reporter-visible), the assigned organisation,
 * and the mutations staff perform on it (add note, change status, assign org).
 *
 * AUTHORIZATION BOUNDARY: unlike the anonymous statusService (which strips the
 * narrative, evidence and internal notes server-side), this service is reached
 * ONLY through requireStaff routes — an authenticated attorney/officer/admin may
 * read everything. That is why we return description, all notes, etc. The guard
 * is at the route, not here.
 *
 * PRIVACY: never log case narrative, notes, evidence paths or reference codes.
 * Never expose the raw evidence_path to the client — only a short-lived signed
 * URL (see getEvidenceUrl). Audit `detail` must carry only WHO/WHAT/WHEN
 * metadata (from/to status, org id, visibility flag) — never case content.
 */

const supabase = require('../config/supabase');
const { CASE_STATUSES } = require('../constants');
const { canTransition } = require('./statusTransition');

// Supabase Storage bucket for evidence uploads (mirrors reportsController).
const EVIDENCE_BUCKET = 'evidence';

// How long a signed evidence URL stays valid, in seconds. Deliberately short:
// evidence must never be reachable via a durable/public link (CLAUDE.md), so we
// mint a fresh URL on each detail fetch and let it expire quickly.
const EVIDENCE_URL_TTL_SECONDS = 60;

/**
 * A validation error the controller maps to a 400 (mirrors organisationService).
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/**
 * A not-found error the controller maps to a generic 404.
 */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

/**
 * An authorization error the controller maps to a 403. Used when a status
 * transition is not permitted for the actor's role.
 */
class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

// The platform superadmin role: may access any case (assigned or not). Every
// other role is scoped to cases assigned to its OWN org (see assertInScope).
const PLATFORM_ADMIN = 'admin';

/**
 * ORG-SCOPING guard (the server is the authorization boundary). A platform
 * admin may access any case. Any other role may access ONLY a case assigned to
 * their OWN org; a case in another org — or an UNASSIGNED case — is treated as
 * NOT FOUND (the SAME generic 404 as a missing case), so we never reveal that
 * an out-of-scope case exists.
 *
 * @param {?string} assignedOrgId  the case's assigned_org_id (may be null)
 * @param {?{ role?: string, org?: string }} caller  the acting staff member
 * @throws {NotFoundError} when the case is out of the caller's scope
 */
function assertInScope(assignedOrgId, caller) {
  if (!caller || caller.role === PLATFORM_ADMIN) {
    return; // platform admin: unrestricted
  }
  if (!assignedOrgId || assignedOrgId !== caller.org) {
    // Out of scope (unassigned, or another org's case) → indistinguishable from
    // a genuinely missing case. Do NOT leak that it exists.
    throw new NotFoundError('Case not found.');
  }
}

// The full case columns a staff member may receive. Note evidence_path is
// selected here so we can MINT a signed URL from it — but it is NEVER returned
// to the client (see assembleCaseDetail, which drops it).
const FULL_CASE_COLUMNS =
  'id, reference_code, reporter_type, case_type, custom_category, title, description, ' +
  'people_involved, victim_information, incident_date, incident_date_approximate, ' +
  'incident_time, incident_time_approximate, district, location_name, ' +
  'evidence_path, evidence_description, other_witnesses, witness_details, ' +
  'immediate_risk, previously_reported, previous_report_details, assistance_requested, ' +
  'additional_information, status, assigned_org_id, created_at, updated_at';

/**
 * Generate a short-lived signed URL for an evidence file, or null if there is
 * no evidence. Isolated in its own function so it is easy to reason about and to
 * mock in tests — evidence-URL minting is the one place that touches Storage.
 *
 * @param {?string} evidencePath  the stored (random) filename, or null
 * @returns {Promise<?string>} a signed URL valid for EVIDENCE_URL_TTL_SECONDS,
 *   or null when there is no evidence / the URL could not be minted.
 */
async function getEvidenceUrl(evidencePath) {
  if (!evidencePath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(evidencePath, EVIDENCE_URL_TTL_SECONDS);

  if (error || !data) {
    // Never throw the whole detail request away because a signed URL failed —
    // the case is still viewable. Log a non-sensitive message only (never the
    // evidence path itself).
    console.error(
      'Failed to mint evidence signed URL:',
      error ? error.message : 'no data',
    );
    return null;
  }

  return data.signedUrl;
}

/**
 * Compute the statuses the given role may move this case to, by asking the
 * canonical guard for every candidate. The client renders one action per entry,
 * so invalid transitions never even appear as buttons.
 *
 * @param {string} currentStatus
 * @param {string} role
 * @returns {string[]} the allowed target statuses
 */
function computeAllowedTransitions(currentStatus, role) {
  return CASE_STATUSES.filter((candidate) =>
    canTransition(currentStatus, candidate, role),
  );
}

/**
 * Load a staff member's name lookup for a set of author ids. Returns a Map of
 * id → name so note authors can be labelled. Missing/unknown authors map to
 * null (a note whose author row was deleted keeps ON DELETE SET NULL).
 *
 * @param {string[]} authorIds
 * @returns {Promise<Map<string, string>>}
 */
async function loadStaffNames(authorIds) {
  const uniqueIds = [...new Set(authorIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('staff_users')
    .select('id, name')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`Staff name lookup failed: ${error.message}`);
  }

  return new Map((data || []).map((s) => [s.id, s.name]));
}

/**
 * Load the assigned organisation's public summary, or null if unassigned.
 *
 * @param {?string} orgId
 * @returns {Promise<?{ id: string, name: string, district: string }>}
 */
async function loadAssignedOrg(orgId) {
  if (!orgId) {
    return null;
  }

  const { data, error } = await supabase
    .from('organisations')
    .select('id, name, district')
    .eq('id', orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Assigned org lookup failed: ${error.message}`);
  }

  return data || null;
}

/**
 * Fetch the full staff view of a single case.
 *
 * @param {string} id     the case uuid
 * @param {{ role?: string, org?: string }} caller  the acting staff member
 *        (role drives allowed_transitions; role+org drive the org-scope guard)
 * @returns {Promise<object>} the assembled detail object
 * @throws {NotFoundError} when the id matches no case, OR the case is out of the
 *        caller's org scope (same generic 404 — no oracle)
 */
async function getCaseDetail(id, caller) {
  const role = caller && caller.role;
  const trimmedId = (id || '').trim();
  if (!trimmedId) {
    // Treat an empty id the same as not-found — a generic 404, no oracle.
    throw new NotFoundError('Case not found.');
  }

  const { data: caseRow, error: caseError } = await supabase
    .from('case_reports')
    .select(FULL_CASE_COLUMNS)
    .eq('id', trimmedId)
    .maybeSingle();

  if (caseError) {
    throw new Error(`Case lookup failed: ${caseError.message}`);
  }
  if (!caseRow) {
    // Generic 404 — do not reveal whether the id is malformed vs simply absent.
    throw new NotFoundError('Case not found.');
  }

  // ORG-SCOPING: a non-platform-admin may only view a case assigned to their
  // own org; anything else is the SAME generic 404 (do not reveal it exists).
  assertInScope(caseRow.assigned_org_id, caller);

  // ALL notes — internal AND reporter-visible. Staff may read everything (see
  // authorization matrix); the reporter-visible/internal split is surfaced to
  // the client via is_reporter_visible so it can badge each note, NOT filtered.
  const { data: notes, error: notesError } = await supabase
    .from('case_notes')
    .select('id, note, is_reporter_visible, author_id, created_at')
    .eq('case_id', caseRow.id)
    .order('created_at', { ascending: true }); // oldest -> newest timeline

  if (notesError) {
    throw new Error(`Case notes lookup failed: ${notesError.message}`);
  }

  const noteRows = notes || [];

  // Fetch author names in a second query (join-by-lookup) and attach them.
  const staffNames = await loadStaffNames(noteRows.map((n) => n.author_id));

  const assembledNotes = noteRows.map((n) => ({
    id: n.id,
    note: n.note,
    is_reporter_visible: n.is_reporter_visible,
    author_id: n.author_id,
    author_name: n.author_id ? staffNames.get(n.author_id) || null : null,
    created_at: n.created_at,
  }));

  const [evidenceUrl, assignedOrg] = await Promise.all([
    getEvidenceUrl(caseRow.evidence_path),
    loadAssignedOrg(caseRow.assigned_org_id),
  ]);

  return assembleCaseDetail(caseRow, {
    notes: assembledNotes,
    evidenceUrl,
    assignedOrg,
    allowedTransitions: computeAllowedTransitions(caseRow.status, role),
  });
}

/**
 * Assemble the client-facing detail object. Critically, the raw evidence_path is
 * DROPPED here — only `has_evidence` (boolean) and `evidence_url` (short-lived,
 * possibly null) ever leave the server. Explicitly listing the returned columns
 * (rather than spreading caseRow) means evidence_path can never leak by accident.
 */
function assembleCaseDetail(
  caseRow,
  { notes, evidenceUrl, assignedOrg, allowedTransitions },
) {
  return {
    id: caseRow.id,
    reference_code: caseRow.reference_code,
    reporter_type: caseRow.reporter_type,
    case_type: caseRow.case_type,
    custom_category: caseRow.custom_category,
    title: caseRow.title,
    description: caseRow.description,
    people_involved: caseRow.people_involved,
    victim_information: caseRow.victim_information,
    incident_date: caseRow.incident_date,
    incident_date_approximate: caseRow.incident_date_approximate,
    incident_time: caseRow.incident_time,
    incident_time_approximate: caseRow.incident_time_approximate,
    district: caseRow.district,
    location_name: caseRow.location_name,
    other_witnesses: caseRow.other_witnesses,
    witness_details: caseRow.witness_details,
    immediate_risk: caseRow.immediate_risk,
    previously_reported: caseRow.previously_reported,
    previous_report_details: caseRow.previous_report_details,
    assistance_requested: caseRow.assistance_requested || [],
    additional_information: caseRow.additional_information,
    status: caseRow.status,
    assigned_org_id: caseRow.assigned_org_id,
    created_at: caseRow.created_at,
    updated_at: caseRow.updated_at,
    // Evidence: never the raw path. A boolean + a short-lived signed URL only.
    has_evidence: Boolean(caseRow.evidence_path),
    evidence_url: evidenceUrl,
    evidence_description: caseRow.evidence_description,
    assigned_org: assignedOrg,
    notes,
    allowed_transitions: allowedTransitions,
  };
}

/**
 * Add a note to a case, authored by the given staff member.
 *
 * @param {object} params
 * @param {string}  params.caseId
 * @param {string}  params.authorId          the acting staff member's id
 * @param {string}  params.note              the note text (must be non-empty)
 * @param {boolean} params.isReporterVisible whether the reporter may see it
 * @param {?object} params.caller            the acting staff member (role+org)
 * @returns {Promise<object>} the created note, incl. author_name
 * @throws {ValidationError} when the note is empty
 * @throws {NotFoundError}   when the case does not exist / is out of scope
 */
async function addNote({ caseId, authorId, note, isReporterVisible, caller }) {
  const trimmedNote = (note || '').trim();
  if (!trimmedNote) {
    throw new ValidationError('A note cannot be empty.');
  }

  // Confirm the case exists AND is in the caller's org scope — an add against a
  // bogus or out-of-scope id is a clean generic 404 rather than a FK error/oracle.
  await assertCaseExists(caseId, caller);

  const { data, error } = await supabase
    .from('case_notes')
    .insert({
      case_id: caseId,
      author_id: authorId,
      note: trimmedNote,
      // Coerce to a strict boolean — the body value is client-controlled.
      is_reporter_visible: Boolean(isReporterVisible),
    })
    .select('id, note, is_reporter_visible, author_id, created_at')
    .single();

  if (error) {
    throw new Error(`Note insert failed: ${error.message}`);
  }

  const staffNames = await loadStaffNames([data.author_id]);

  return {
    id: data.id,
    note: data.note,
    is_reporter_visible: data.is_reporter_visible,
    author_id: data.author_id,
    author_name: data.author_id ? staffNames.get(data.author_id) || null : null,
    created_at: data.created_at,
  };
}

/**
 * Change a case's status, enforcing the state machine and the reason rule.
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.status  the desired new status
 * @param {?string} params.reason a justification (required for a backward move)
 * @param {string} params.role    the acting staff member's role
 * @param {?object} params.caller the acting staff member (role+org, for scoping)
 * @returns {Promise<{ from: string, to: string, status: string }>}
 * @throws {ValidationError} unknown target status, or missing required reason
 * @throws {ForbiddenError}  transition not permitted for the role
 * @throws {NotFoundError}   the case does not exist / is out of scope
 */
async function changeStatus({ caseId, status, reason, role, caller }) {
  // Reject an unknown target status up front (before any DB read) — a bad value
  // is a client error, not a state-machine decision.
  if (!CASE_STATUSES.includes(status)) {
    throw new ValidationError(`status must be one of: ${CASE_STATUSES.join(', ')}.`);
  }

  // loadCaseStatus also runs the org-scope guard, so a mutation on an
  // out-of-scope case is a generic 404 before any transition logic.
  const currentStatus = await loadCaseStatus(caseId, caller);

  // The canonical guard is the ONE authority on whether the edge exists AND the
  // role may take it. A same-status "no-op" is rejected here too, because
  // canTransition returns false for it (there is no self-edge).
  if (!canTransition(currentStatus, status, role)) {
    throw new ForbiddenError(
      `You cannot move a case from "${currentStatus}" to "${status}".`,
    );
  }

  // A referred -> under_review move is a BACKWARD move: pulling a case back into
  // review must be justified so the audit trail records WHY. canTransition only
  // checks the role (a reason is data, not authorisation), so the reason rule is
  // enforced here, at the service layer.
  const trimmedReason = (reason || '').trim();
  if (currentStatus === 'referred' && status === 'under_review' && !trimmedReason) {
    throw new ValidationError(
      'A reason is required to move a referred case back to review.',
    );
  }

  const { error } = await supabase
    .from('case_reports')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', caseId);

  if (error) {
    throw new Error(`Status update failed: ${error.message}`);
  }

  return { from: currentStatus, to: status, status, reason: trimmedReason || null };
}

/**
 * Assign (or unassign) a case to an organisation.
 *
 * @param {object} params
 * @param {string}  params.caseId
 * @param {?string} params.assignedOrgId  the org id, or null to unassign
 * @param {?object} params.caller         the acting staff member (role+org)
 * @returns {Promise<{ assigned_org_id: ?string }>}
 * @throws {ValidationError} when the org does not exist or is inactive
 * @throws {NotFoundError}   when the case does not exist / is out of scope
 */
async function assignCase({ caseId, assignedOrgId, caller }) {
  // Scope guard: a non-platform-admin may only touch a case in its own org.
  // (Routing an UNASSIGNED case is therefore platform-admin-only, since an
  // unassigned case is out of scope for everyone else — see assertInScope.)
  await assertCaseExists(caseId, caller);

  // null / '' means "unassign". Anything else must be a real, ACTIVE org — you
  // cannot route a case to an org that is gone or switched off.
  const normalisedOrgId = assignedOrgId ? String(assignedOrgId).trim() : null;

  if (normalisedOrgId) {
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('id, is_active')
      .eq('id', normalisedOrgId)
      .maybeSingle();

    if (orgError) {
      throw new Error(`Assign org lookup failed: ${orgError.message}`);
    }
    if (!org || !org.is_active) {
      throw new ValidationError('That organisation does not exist or is inactive.');
    }
  }

  const { error } = await supabase
    .from('case_reports')
    .update({ assigned_org_id: normalisedOrgId, updated_at: new Date().toISOString() })
    .eq('id', caseId);

  if (error) {
    throw new Error(`Case assignment failed: ${error.message}`);
  }

  return { assigned_org_id: normalisedOrgId };
}

/**
 * Read just a case's current status, or throw NotFoundError. Also enforces the
 * org-scope guard so a mutation on an out-of-scope case is the SAME generic 404.
 *
 * @param {string} caseId
 * @param {?{ role?: string, org?: string }} caller
 */
async function loadCaseStatus(caseId, caller) {
  const { data, error } = await supabase
    .from('case_reports')
    // assigned_org_id is selected so the scope guard can run — a mutation must
    // be refused (as a 404) on a case outside the caller's org.
    .select('status, assigned_org_id')
    .eq('id', (caseId || '').trim())
    .maybeSingle();

  if (error) {
    throw new Error(`Case status lookup failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError('Case not found.');
  }
  assertInScope(data.assigned_org_id, caller);
  return data.status;
}

/**
 * Confirm a case exists AND is in the caller's scope, or throw NotFoundError.
 * Used before a mutation so a bogus/out-of-scope id is a clean generic 404
 * rather than a DB-level failure or an oracle.
 *
 * @param {string} caseId
 * @param {?{ role?: string, org?: string }} caller
 */
async function assertCaseExists(caseId, caller) {
  const { data, error } = await supabase
    .from('case_reports')
    .select('id, assigned_org_id')
    .eq('id', (caseId || '').trim())
    .maybeSingle();

  if (error) {
    throw new Error(`Case existence check failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError('Case not found.');
  }
  assertInScope(data.assigned_org_id, caller);
}

module.exports = {
  getCaseDetail,
  addNote,
  changeStatus,
  assignCase,
  getEvidenceUrl,
  computeAllowedTransitions,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  FULL_CASE_COLUMNS,
  EVIDENCE_URL_TTL_SECONDS,
};
