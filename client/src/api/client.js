/**
 * JusticeNow (web) — Axios instances for talking to the shared Express API.
 *
 * PRIVACY NOTE: the reporter `api` instance below deliberately has NO auth
 * token interceptor — reporters never log in, so their requests must stay
 * permanently anonymous. Staff auth lives on a SEPARATE `staffApi` instance
 * (see the "WHY TWO AXIOS INSTANCES" comment below). Mirrors
 * /mobile/src/api/client.ts.
 */

import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL,
  timeout: 15000, // 15s — evidence uploads can be slow on mobile data
});

/**
 * WHY TWO AXIOS INSTANCES (anonymity by construction):
 * Reporter requests must NEVER carry a staff Authorization header — a reporter
 * is anonymous and un-authenticated, and attaching a staff token to their call
 * would tie the request to an identity server-side, defeating the whole point.
 * So the reporter `api` above stays permanently tokenless, and everything the
 * authenticated staff dashboard calls goes through this SEPARATE `staffApi`
 * instance, which is the only one that ever attaches the token.
 */
const staffApi = axios.create({
  baseURL,
  timeout: 15000, // same as reporter api; some staff lists can be large
});

// Module-level token holder, set by AuthContext on login/logout. Kept in memory
// only (never persisted) — mirrors the app's "leave no trace" stance.
let staffToken = null;

/** Arm/disarm the staff token. Called by AuthContext.login()/logout(). */
export function setStaffToken(token) {
  staffToken = token;
}

// Attach the bearer token to staff calls only, and only when one is set.
staffApi.interceptors.request.use((config) => {
  if (staffToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${staffToken}`;
  }
  return config;
});

/* ==========================================================================
   Reporter (anonymous) calls — ALWAYS the tokenless `api` instance.
   ========================================================================== */

/**
 * Submit an anonymous case report.
 * Sends multipart/form-data so the optional evidence file can be included.
 * The field names (case_type, district, description, incident_date, evidence)
 * match the server exactly — do not rename them.
 */
export const submitReport = ({ caseType, incidentDate, district, description, evidenceFile }) => {
  const form = new FormData();
  form.append('case_type', caseType);
  form.append('district', district);
  form.append('description', description);
  if (incidentDate) form.append('incident_date', incidentDate);
  if (evidenceFile) form.append('evidence', evidenceFile);
  return api.post('/reports', form);
};

/**
 * Anonymous case status lookup by reference code.
 *
 * Uses the TOKENLESS reporter `api` on purpose — reporters never authenticate,
 * so this call must NEVER carry a staff Authorization header. The code is URL-
 * encoded defensively even though generated codes are already URL-safe.
 *
 * The server rate-limits this endpoint and returns an IDENTICAL generic 404 for
 * both "not found" and "rate limited"; screens must treat any 4xx the same way
 * and not try to distinguish them.
 */
export const fetchCaseStatus = (referenceCode) =>
  api.get(`/status/${encodeURIComponent(referenceCode)}`);

/**
 * List active legal-aid organisations, optionally filtered by district and/or
 * case type. Uses the TOKENLESS reporter `api` — the directory is public and
 * reporters never authenticate, so no Authorization header is sent. The
 * caseType filter is mapped to the server's snake_case `case_type` query param.
 */
export const fetchOrganisations = (filters = {}) => {
  const params = {};
  if (filters.district) params.district = filters.district;
  if (filters.caseType) params.case_type = filters.caseType;
  return api.get('/organisations', { params });
};

/**
 * Fetch one active organisation's public detail by id. Uses the TOKENLESS
 * reporter `api` — same public/anonymous rationale as fetchOrganisations.
 */
export const fetchOrganisation = (id) =>
  api.get(`/organisations/${encodeURIComponent(id)}`);

/* ==========================================================================
   Staff calls — ALWAYS the token-bearing `staffApi` instance, EXCEPT login
   (which mints the token, so no token exists yet).
   ========================================================================== */

/**
 * Staff login. Uses the TOKENLESS reporter `api` on purpose: at login time
 * there is no token yet, and this endpoint is what mints one. On success the
 * caller (AuthContext) stores the token and arms staffApi via setStaffToken().
 */
export const loginStaff = (email, password) =>
  api.post('/staff/login', { email, password });

/**
 * Staff login via a Supabase Google session. The client completes the Supabase
 * Auth Google flow, then hands the resulting access token here; the server
 * verifies it and mints our JWT ONLY if the Google email is an active staff
 * member. Tokenless `api` for the same reason as loginStaff (mints the token).
 */
export const loginStaffGoogle = (accessToken) =>
  api.post('/staff/google', { access_token: accessToken });

/**
 * Staff: list reports, optionally filtered by case type / status.
 *
 * Uses the AUTHENTICATED staffApi (not the tokenless reporter `api`) — listing
 * cases is staff-only (server guards GET /reports with requireStaff), so the
 * Bearer token must be attached. Reporter-facing calls must never touch staffApi.
 */
export const fetchReports = (filters = {}) => {
  const params = {};
  if (filters.caseType) params.case_type = filters.caseType;
  if (filters.status) params.status = filters.status;
  return staffApi.get('/reports', { params });
};

/**
 * Staff: fetch the full detail of one case. Uses the AUTHENTICATED staffApi —
 * the full view (narrative, evidence, internal notes) is staff-only. Re-fetch
 * to refresh the short-lived evidence_url.
 */
export const fetchCaseDetail = (id) =>
  staffApi.get(`/reports/${encodeURIComponent(id)}`);

/**
 * Staff: add a note to a case. `isReporterVisible` maps to the server's
 * snake_case `is_reporter_visible`. The note text is case content — never log it.
 */
export const addCaseNote = (id, { note, isReporterVisible }) =>
  staffApi.post(`/reports/${encodeURIComponent(id)}/notes`, {
    note,
    is_reporter_visible: isReporterVisible,
  });

/**
 * Staff: change a case's status. `reason` is required by the server only for a
 * backward referred→under_review move; the server enforces the state machine
 * (canTransition) and returns 403/400 when a move is not allowed / lacks a reason.
 */
export const changeCaseStatus = (id, { status, reason }) =>
  staffApi.patch(`/reports/${encodeURIComponent(id)}/status`, { status, reason });

/**
 * Staff: assign (or unassign, with null) a case to an organisation. The server
 * validates the org exists and is active, returning 400 otherwise. `assignedOrgId`
 * maps to the server's snake_case `assigned_org_id`.
 */
export const assignCase = (id, assignedOrgId) =>
  staffApi.patch(`/reports/${encodeURIComponent(id)}/assign`, {
    assigned_org_id: assignedOrgId,
  });

/**
 * Staff: fetch the aggregate analytics figures. Uses the AUTHENTICATED staffApi
 * — analytics is staff-only (server guards GET /analytics with requireStaff).
 * Available to ALL staff roles.
 */
export const fetchAnalytics = () => staffApi.get('/analytics');

/**
 * Staff (ADMIN ONLY): fetch a page of audit-trail entries, newest first. Uses
 * the AUTHENTICATED staffApi — the audit trail is admin-only (server guards GET
 * /audit with requireStaff THEN requireRole('admin')). The client guard is UX
 * only; the server is the real boundary. Empty/undefined params are omitted.
 */
export const fetchAudit = (filters = {}) => {
  const params = {};
  if (filters.limit !== undefined) params.limit = filters.limit;
  if (filters.offset !== undefined) params.offset = filters.offset;
  if (filters.action) params.action = filters.action;
  return staffApi.get('/audit', { params });
};

/**
 * ADMIN: list ALL organisations (active AND inactive). Uses the token-bearing
 * staffApi — GET /organisations/all is guarded by requireStaff +
 * requireRole('admin') on the server; the server is the real boundary.
 */
export const fetchAllOrganisations = () => staffApi.get('/organisations/all');

/** ADMIN: create an organisation. Uses staffApi (admin-guarded on the server). */
export const createOrganisation = (input) => staffApi.post('/organisations', input);

/** ADMIN: update an organisation (partial; may include is_active). Uses staffApi. */
export const updateOrganisation = (id, input) =>
  staffApi.put(`/organisations/${encodeURIComponent(id)}`, input);

/**
 * ADMIN: deactivate (SOFT-delete) an organisation. Uses staffApi. The server
 * NEVER hard-deletes — it flips is_active to false (a DB DELETE would cascade-
 * delete the org's staff_users).
 */
export const deactivateOrganisation = (id) =>
  staffApi.delete(`/organisations/${encodeURIComponent(id)}`);

/**
 * ADMIN: list ALL staff accounts (active AND inactive). Uses the token-bearing
 * staffApi — GET /staff is admin-guarded on the server. Never returns password_hash.
 */
export const fetchStaff = () => staffApi.get('/staff');

/** ADMIN: create a staff account. Uses staffApi. Never returns the password/hash. */
export const createStaff = (input) => staffApi.post('/staff', input);

/**
 * ADMIN: update a staff account (partial; may include a new password or toggle
 * is_active). Uses staffApi.
 */
export const updateStaff = (id, input) =>
  staffApi.put(`/staff/${encodeURIComponent(id)}`, input);

/**
 * ADMIN: deactivate (SOFT-delete) a staff account. Uses staffApi. The server
 * NEVER hard-deletes (a DB DELETE would strip the actor from the audit trail);
 * it flips is_active to false and refuses to deactivate the caller's own account
 * or the last active admin.
 */
export const deactivateStaff = (id) =>
  staffApi.delete(`/staff/${encodeURIComponent(id)}`);

/* ==========================================================================
   Self-service staff profile — the caller edits their OWN record only. Every
   call uses the AUTHENTICATED staffApi (each endpoint is guarded requireStaff
   on the server, which scopes the write to req.staff.id — there is no id arg a
   caller could point at someone else's row).
   ========================================================================== */

/** Staff: fetch the caller's own profile (never carries password_hash). */
export const fetchMe = () => staffApi.get('/staff/me');

/**
 * Staff: update the caller's own editable fields. Only the whitelisted
 * snake_case fields are sent; the server is the authority — it validates the
 * NIC + mobile, DERIVES gender + date_of_birth from the NIC, and returns 400
 * with a message on any invalid field. Fields left undefined are omitted so a
 * partial edit never clobbers untouched values.
 */
export const updateMe = (input = {}) => {
  const body = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.nic !== undefined) body.nic = input.nic;
  if (input.phone !== undefined) body.phone = input.phone;
  if (input.designation !== undefined) body.designation = input.designation;
  if (input.barNumber !== undefined) body.bar_number = input.barNumber;
  return staffApi.patch('/staff/me', body);
};

/**
 * Staff: upload the caller's own avatar. Sends multipart/form-data with the
 * field name `avatar` (matches the server's multer single('avatar')). The
 * original filename is discarded server-side for privacy; the response is
 * { avatar_url }.
 */
export const uploadAvatar = (file) => {
  const form = new FormData();
  form.append('avatar', file);
  return staffApi.post('/staff/me/avatar', form);
};

/**
 * Staff: change the caller's OWN password. Only offered for password accounts
 * (the client hides the form for Google sessions); the server is the real
 * boundary and refuses Google sessions with a 400. `currentPassword` /
 * `newPassword` map to the server's snake_case body. Never log these values.
 */
export const changeMyPassword = ({ currentPassword, newPassword }) =>
  staffApi.post('/staff/me/password', {
    current_password: currentPassword,
    new_password: newPassword,
  });

/** Health check — useful when debugging "is the server up?". */
export const checkHealth = () => api.get('/health');

export { staffApi };
export default api;
