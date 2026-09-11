/**
 * JusticeNow (mobile) — Axios instance for talking to the shared Express API.
 *
 * PRIVACY NOTE: there is deliberately NO auth token interceptor here for
 * reporters — reporters never log in. Staff auth will be added in a later
 * sprint as a separate concern. (Mirrors /client/src/api/client.js.)
 *
 * BASE URL: read from the Expo public env var EXPO_PUBLIC_API_URL. See
 * mobile/.env.example. A physical phone CANNOT reach "localhost" — that means
 * the phone itself — so during development this must be your computer's LAN IP
 * (e.g. http://192.168.1.42:5000/api), and the phone must be on the same
 * Wi-Fi network as the computer running the server.
 */

import axios from 'axios';
import type { DocumentPickerAsset } from 'expo-document-picker';

// EXPO_PUBLIC_ vars are inlined into the app at build time by Expo.
// The localhost fallback only helps the web/emulator target; a real device
// needs the LAN IP set in .env (see the note above).
const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

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
let staffToken: string | null = null;

/** Arm/disarm the staff token. Called by AuthContext.login()/logout(). */
export function setStaffToken(token: string | null): void {
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

/**
 * The staff record the server returns on a successful login. snake_case
 * `organisation_id` matches the DB/API payload exactly (per the naming rule).
 */
export interface StaffLoginData {
  token: string;
  staff: {
    id: string;
    name: string;
    email: string;
    role: string;
    organisation_id: string;
  };
}

/**
 * The server wraps every success in { success, data } — same envelope as
 * CaseStatusResponse / OrganisationListResponse — so the token+staff live under
 * `data`. Callers read `res.data.data`, consistent with the rest of this client.
 */
export interface StaffLoginResponse {
  success: boolean;
  data: StaffLoginData;
}

/**
 * Staff login. Uses the TOKENLESS reporter `api` on purpose: at login time
 * there is no token yet, and this endpoint is what mints one. On success the
 * caller (AuthContext) stores the token and arms staffApi via setStaffToken().
 */
export const loginStaff = (email: string, password: string) =>
  api.post<StaffLoginResponse>('/staff/login', { email, password });

/**
 * Staff login via a Supabase Google session. The screen runs the Supabase Auth
 * Google flow and passes the resulting access token here; the server verifies it
 * and mints our JWT ONLY if the Google email is an active staff member. Tokenless
 * `api` for the same reason as loginStaff (this mints the token).
 */
export const loginStaffGoogle = (accessToken: string) =>
  api.post<StaffLoginResponse>('/staff/google', { access_token: accessToken });

export interface RegisterResponse {
  success: boolean;
  message: string;
}

export interface RegisterStaffInput {
  name: string;
  email: string;
  password: string;
  role: string; // 'org_admin' | 'attorney' | 'officer' (never 'admin')
  organisationId: string;
}

/**
 * Self-service staff signup (email + password). Tokenless `api` — there is no
 * session yet. The account is created PENDING admin approval (inactive); the
 * server returns a generic pending message and the account cannot log in until
 * an admin activates it. 'admin' is refused server-side.
 */
export const registerStaff = (input: RegisterStaffInput) =>
  api.post<RegisterResponse>('/staff/register', {
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role,
    organisation_id: input.organisationId,
  });

/**
 * Self-service staff signup via a Supabase Google session. The screen runs the
 * Google OAuth flow, then passes the access token plus the chosen role + org; the
 * server takes the email from the Google-verified identity and creates the same
 * PENDING (inactive) account. Tokenless `api`.
 */
export const registerStaffGoogle = (input: {
  accessToken: string;
  name: string;
  role: string;
  organisationId: string;
}) =>
  api.post<RegisterResponse>('/staff/register/google', {
    access_token: input.accessToken,
    name: input.name,
    role: input.role,
    organisation_id: input.organisationId,
  });

export { staffApi };

export interface SubmitReportInput {
  reporterType: string;
  caseType: string;
  customCategory?: string;
  title?: string;
  description: string;
  peopleInvolved?: string;
  victimInformation?: string;
  incidentDate: string; // 'YYYY-MM-DD' or '' when not provided
  incidentDateApproximate?: boolean;
  incidentTime?: string;
  incidentTimeApproximate?: boolean;
  district?: string;
  locationName?: string;
  evidenceFile: DocumentPickerAsset | null;
  evidenceDescription?: string;
  otherWitnesses?: string;
  witnessDetails?: string;
  immediateRisk?: string;
  previouslyReported?: string;
  previousReportDetails?: string;
  assistanceRequested?: string[];
  additionalInformation?: string;
}

/**
 * Submit an anonymous case report.
 *
 * Sends multipart/form-data so the optional evidence file can be included. The
 * snake_case field names match the server exactly — do not rename them. Optional
 * fields are only appended when set, keeping the payload (and thus the stored
 * row) minimal — data minimisation.
 *
 * On React Native a file part is described by { uri, name, type } rather than a
 * browser File object; that shape is what the server's multer middleware reads.
 */
export const submitReport = (input: SubmitReportInput) => {
  const {
    reporterType,
    caseType,
    customCategory,
    title,
    description,
    peopleInvolved,
    victimInformation,
    incidentDate,
    incidentDateApproximate,
    incidentTime,
    incidentTimeApproximate,
    district,
    locationName,
    evidenceFile,
    evidenceDescription,
    otherWitnesses,
    witnessDetails,
    immediateRisk,
    previouslyReported,
    previousReportDetails,
    assistanceRequested,
    additionalInformation,
  } = input;

  const form = new FormData();
  const put = (key: string, value?: string) => {
    if (value && value.trim()) form.append(key, value.trim());
  };

  // Required.
  form.append('reporter_type', reporterType);
  form.append('case_type', caseType);
  form.append('description', description);

  // Optional text.
  put('custom_category', customCategory);
  put('title', title);
  put('people_involved', peopleInvolved);
  put('victim_information', victimInformation);
  put('incident_time', incidentTime);
  put('district', district);
  put('location_name', locationName);
  put('evidence_description', evidenceDescription);
  put('other_witnesses', otherWitnesses);
  put('witness_details', witnessDetails);
  put('immediate_risk', immediateRisk);
  put('previously_reported', previouslyReported);
  put('previous_report_details', previousReportDetails);
  put('additional_information', additionalInformation);

  if (incidentDate) form.append('incident_date', incidentDate);
  if (incidentDateApproximate) form.append('incident_date_approximate', 'true');
  if (incidentTimeApproximate) form.append('incident_time_approximate', 'true');
  if (assistanceRequested && assistanceRequested.length > 0) {
    form.append('assistance_requested', JSON.stringify(assistanceRequested));
  }

  if (evidenceFile) {
    // React Native's FormData accepts this { uri, name, type } object as a file.
    // The original filename is not privacy-sensitive here because the server
    // discards it and stores the file under a random name.
    form.append('evidence', {
      uri: evidenceFile.uri,
      name: evidenceFile.name,
      type: evidenceFile.mimeType ?? 'application/octet-stream',
    } as unknown as Blob);
  }
  return api.post('/reports', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export interface ReportFilters {
  caseType?: string;
  status?: string;
}

/**
 * A single report row in the staff list. Mirrors the server's listReports
 * projection EXACTLY (reportsController.js) — and note what is ABSENT: there is
 * no reporter identity of any kind (no name/email/phone/user_id), because the
 * case_reports table has no such columns by design. Nothing here can identify a
 * reporter. There is also deliberately no narrative/evidence in the list view.
 */
export interface ReportListItem {
  id: string;
  reference_code: string;
  case_type: string;
  incident_date: string | null;
  district: string;
  status: string;
  assigned_org_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportListResponse {
  success: boolean;
  data: ReportListItem[];
}

/**
 * Staff: list reports, optionally filtered by case type / status.
 *
 * Uses the AUTHENTICATED staffApi (not the tokenless reporter `api`) — listing
 * cases is staff-only (server guards GET /reports with requireStaff), so the
 * Bearer token must be attached. This is the one place a reports call carries a
 * token; reporter-facing calls must never touch staffApi.
 */
export const fetchReports = (filters: ReportFilters = {}) => {
  const params: Record<string, string> = {};
  if (filters.caseType) params.case_type = filters.caseType;
  if (filters.status) params.status = filters.status;
  return staffApi.get<ReportListResponse>('/reports', { params });
};

/**
 * A single reporter-visible note in a case's status timeline.
 * The server returns ONLY { note, created_at } — never an author or an internal
 * note — so the reporter's anonymity and the internal/visible boundary hold.
 */
export interface CaseStatusNote {
  note: string;
  created_at: string;
}

/**
 * The safe projection returned for an anonymous status lookup. This mirrors the
 * server's server-side filter exactly: it deliberately has NO description
 * (narrative), evidence_path, assigned_org_id, or note author — those are never
 * sent to an anonymous reporter.
 */
export interface CaseStatus {
  reference_code: string;
  case_type: string;
  custom_category: string | null;
  title: string | null;
  district: string | null;
  location_name: string | null;
  incident_date: string | null;
  incident_date_approximate: boolean;
  incident_time: string | null;
  incident_time_approximate: boolean;
  immediate_risk: string | null;
  assistance_requested: string[];
  status: string;
  created_at: string;
  updated_at: string;
  notes: CaseStatusNote[];
}

export interface CaseStatusResponse {
  success: boolean;
  data: CaseStatus;
}

/**
 * Anonymous case status lookup by reference code.
 *
 * Uses the TOKENLESS reporter `api` on purpose — reporters never authenticate,
 * so this call must NEVER carry a staff Authorization header. The code is URL-
 * encoded defensively even though generated codes are already URL-safe.
 *
 * The server rate-limits this endpoint and returns an IDENTICAL generic 404 for
 * both "not found" and "rate limited"; the screen must treat any 4xx the same
 * way and not try to distinguish them.
 */
export const fetchCaseStatus = (referenceCode: string) =>
  api.get<CaseStatusResponse>(`/status/${encodeURIComponent(referenceCode)}`);

/**
 * A public legal-aid organisation in the resource directory. Mirrors the
 * server's PUBLIC_ORG_COLUMNS projection exactly: only active orgs and only
 * public contact fields are ever returned. There is deliberately no is_active
 * flag or internal bookkeeping — a reporter never sees inactive orgs.
 */
export interface Organisation {
  id: string;
  name: string;
  description: string | null;
  district: string;
  case_types: string[];
  contact_phone: string | null;
  contact_email: string | null;
}

export interface OrganisationListResponse {
  success: boolean;
  data: Organisation[];
}

export interface OrganisationResponse {
  success: boolean;
  data: Organisation;
}

export interface OrganisationFilters {
  district?: string;
  caseType?: string;
}

/**
 * List active legal-aid organisations, optionally filtered by district and/or
 * case type. Uses the TOKENLESS reporter `api` on purpose — the directory is
 * public and reporters never authenticate, so no Authorization header is sent.
 *
 * The caseType filter is mapped to the server's snake_case `case_type` query
 * param, the same way fetchReports maps its filters.
 */
export const fetchOrganisations = (filters: OrganisationFilters = {}) => {
  const params: Record<string, string> = {};
  if (filters.district) params.district = filters.district;
  if (filters.caseType) params.case_type = filters.caseType;
  return api.get<OrganisationListResponse>('/organisations', { params });
};

/**
 * Fetch one active organisation's public detail by id. Uses the TOKENLESS
 * reporter `api` — same public/anonymous rationale as fetchOrganisations. A
 * not-found or inactive org returns a generic 404 from the server.
 */
export const fetchOrganisation = (id: string) =>
  api.get<OrganisationResponse>(`/organisations/${encodeURIComponent(id)}`);

export interface TransparencyStats {
  total: number;
  resolved: number;
  resolution_rate: number; // 0..1
  organisations: number;
  by_status: Record<string, number>;
  by_case_type: Record<string, number>;
  by_district: Record<string, number>;
  recent_by_month: { month: string; count: number }[];
  generated_at: string;
}

export interface TransparencyResponse {
  success: boolean;
  data: TransparencyStats;
}

/**
 * Public transparency figures (anonymised aggregate counts). Uses the TOKENLESS
 * reporter `api` — the dashboard is open to everyone and carries no case content.
 */
export const fetchTransparency = () =>
  api.get<TransparencyResponse>('/transparency');

/**
 * The ADMIN view of an organisation: the public Organisation fields PLUS the
 * is_active flag (so the admin console can badge and reactivate inactive orgs).
 * Only authenticated admins ever receive is_active — reporters never do.
 */
export interface AdminOrganisation extends Organisation {
  is_active: boolean;
}

export interface AdminOrganisationListResponse {
  success: boolean;
  data: AdminOrganisation[];
}

export interface AdminOrganisationResponse {
  success: boolean;
  data: AdminOrganisation;
}

/**
 * The create/update payload for an organisation. snake_case fields match the
 * server body exactly (per the naming rule). All fields are optional on the
 * type so the same shape serves both create (server requires name + district)
 * and a partial update (which may also toggle is_active).
 */
export interface OrganisationInput {
  name?: string;
  description?: string | null;
  district?: string;
  case_types?: string[];
  contact_phone?: string | null;
  contact_email?: string | null;
  is_active?: boolean;
}

/**
 * ADMIN: list ALL organisations (active AND inactive). Uses the token-bearing
 * staffApi — GET /organisations/all is guarded by requireStaff +
 * requireRole('admin') on the server; the server is the real boundary.
 */
export const fetchAllOrganisations = () =>
  staffApi.get<AdminOrganisationListResponse>('/organisations/all');

/**
 * ADMIN: create an organisation. Uses staffApi (admin-guarded on the server).
 * The server validates name/district/case_types and returns 400 on bad input.
 */
export const createOrganisation = (input: OrganisationInput) =>
  staffApi.post<AdminOrganisationResponse>('/organisations', input);

/**
 * ADMIN: update an organisation (partial; may include is_active). Uses staffApi.
 * The server returns 404 for an unknown id and 400 on bad input.
 */
export const updateOrganisation = (id: string, input: OrganisationInput) =>
  staffApi.put<AdminOrganisationResponse>(
    `/organisations/${encodeURIComponent(id)}`,
    input,
  );

/**
 * ADMIN: deactivate (SOFT-delete) an organisation. Uses staffApi. The server
 * NEVER hard-deletes — it flips is_active to false (a DB DELETE would cascade-
 * delete the org's staff_users). Returns the deactivated org.
 */
export const deactivateOrganisation = (id: string) =>
  staffApi.delete<AdminOrganisationResponse>(
    `/organisations/${encodeURIComponent(id)}`,
  );

/**
 * The ADMIN view of a staff account (server: staffService.listStaff, the
 * SAFE_STAFF_COLUMNS projection). snake_case matches the API/DB exactly.
 *
 * SECURITY: there is deliberately NO password_hash field — the server NEVER
 * returns it, and the client must never expect or store one. `organisation_name`
 * is a display convenience the server enriches (the org's public label).
 */
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  organisation_id: string;
  organisation_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface StaffListResponse {
  success: boolean;
  data: StaffMember[];
}

export interface StaffResponse {
  success: boolean;
  data: StaffMember;
}

/**
 * The create/update payload for a staff account. snake_case fields match the
 * server body exactly (per the naming rule). All fields are optional on the type
 * so the same shape serves create (server requires name/email/role/
 * organisation_id/password) and a partial update.
 *
 * `password` is the PLAINTEXT the server bcrypt-hashes; it is write-only (never
 * returned) and must never be logged. On update, leaving it out keeps the
 * existing password. There is NO password_hash field — the client never handles
 * a hash.
 */
export interface StaffInput {
  name?: string;
  email?: string;
  role?: string;
  organisation_id?: string;
  password?: string;
  is_active?: boolean;
}

/**
 * ADMIN: list ALL staff accounts (active AND inactive). Uses the token-bearing
 * staffApi — GET /staff is guarded by requireStaff + requireRole('admin') on the
 * server; the server is the real boundary. Never returns password_hash.
 */
export const fetchStaff = () => staffApi.get<StaffListResponse>('/staff');

/**
 * ADMIN: create a staff account. Uses staffApi (admin-guarded on the server).
 * The server validates the fields, bcrypt-hashes the password, and returns 400
 * on bad input or a duplicate email. Never returns the password/hash.
 */
export const createStaff = (input: StaffInput) =>
  staffApi.post<StaffResponse>('/staff', input);

/**
 * ADMIN: update a staff account (partial; may include a new password or toggle
 * is_active). Uses staffApi. The server returns 404 for an unknown id and 400 on
 * bad input / duplicate email.
 */
export const updateStaff = (id: string, input: StaffInput) =>
  staffApi.put<StaffResponse>(`/staff/${encodeURIComponent(id)}`, input);

/**
 * ADMIN: deactivate (SOFT-delete) a staff account. Uses staffApi. The server
 * NEVER hard-deletes (a DB DELETE would strip the actor from the audit trail);
 * it flips is_active to false. It also refuses to deactivate the caller's own
 * account or the last active admin, returning a 400 with a specific message the
 * caller should surface.
 */
export const deactivateStaff = (id: string) =>
  staffApi.delete<StaffResponse>(`/staff/${encodeURIComponent(id)}`);

/**
 * A single note in the STAFF case-detail timeline. Unlike the anonymous
 * CaseStatusNote (which is { note, created_at } only), staff see every field:
 * the visibility flag (to badge internal vs reporter-visible), the author, and
 * the note text. This is only ever fetched through the token-bearing staffApi.
 */
export interface CaseNote {
  id: string;
  note: string;
  is_reporter_visible: boolean;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

/**
 * The organisation summary attached to an assigned case. A trimmed projection
 * ({ id, name, district }) — not the full public Organisation directory shape.
 */
export interface AssignedOrg {
  id: string;
  name: string;
  district: string;
}

/**
 * The FULL staff view of a case (server: caseService.getCaseDetail). Mirrors the
 * server projection EXACTLY. Note what is present that the anonymous CaseStatus
 * never has: description (narrative), notes with authors + visibility, and
 * allowed_transitions. Note what is DELIBERATELY ABSENT: the raw evidence_path —
 * the server returns only has_evidence + a short-lived evidence_url instead.
 */
export interface CaseDetail {
  id: string;
  reference_code: string;
  reporter_type: string | null;
  case_type: string;
  custom_category: string | null;
  title: string | null;
  description: string;
  people_involved: string | null;
  victim_information: string | null;
  incident_date: string | null;
  incident_date_approximate: boolean;
  incident_time: string | null;
  incident_time_approximate: boolean;
  district: string | null;
  location_name: string | null;
  other_witnesses: string | null;
  witness_details: string | null;
  immediate_risk: string | null;
  previously_reported: string | null;
  previous_report_details: string | null;
  assistance_requested: string[];
  additional_information: string | null;
  status: string;
  assigned_org_id: string | null;
  created_at: string;
  updated_at: string;
  has_evidence: boolean;
  evidence_url: string | null;
  evidence_description: string | null;
  assigned_org: AssignedOrg | null;
  notes: CaseNote[];
  allowed_transitions: string[];
}

export interface CaseDetailResponse {
  success: boolean;
  data: CaseDetail;
}

export interface CaseNoteResponse {
  success: boolean;
  data: CaseNote;
}

/**
 * Staff: fetch the full detail of one case.
 *
 * Uses the AUTHENTICATED staffApi — the full view (narrative, evidence, internal
 * notes) is staff-only. Re-fetch this to refresh the short-lived evidence_url.
 */
export const fetchCaseDetail = (id: string) =>
  staffApi.get<CaseDetailResponse>(`/reports/${encodeURIComponent(id)}`);

/**
 * Staff: add a note to a case. `isReporterVisible` maps to the server's
 * snake_case `is_reporter_visible`. The note text is case content — never log it.
 */
export const addCaseNote = (
  id: string,
  { note, isReporterVisible }: { note: string; isReporterVisible: boolean },
) =>
  staffApi.post<CaseNoteResponse>(`/reports/${encodeURIComponent(id)}/notes`, {
    note,
    is_reporter_visible: isReporterVisible,
  });

/**
 * Staff: change a case's status. `reason` is required by the server only for a
 * backward referred→under_review move; the server enforces the state machine
 * (canTransition) and returns 403/400 when a move is not allowed / lacks a
 * required reason.
 */
export const changeCaseStatus = (
  id: string,
  { status, reason }: { status: string; reason?: string },
) =>
  staffApi.patch<{ success: boolean; data: { status: string } }>(
    `/reports/${encodeURIComponent(id)}/status`,
    { status, reason },
  );

/**
 * Staff: assign (or unassign, with null) a case to an organisation. The server
 * validates the org exists and is active, returning 400 otherwise.
 */
export const assignCase = (id: string, assignedOrgId: string | null) =>
  staffApi.patch<{ success: boolean; data: { assigned_org_id: string | null } }>(
    `/reports/${encodeURIComponent(id)}/assign`,
    { assigned_org_id: assignedOrgId },
  );

/**
 * Aggregate analytics for the staff dashboard (server: analyticsService).
 * Mirrors the server shape EXACTLY. This is AGGREGATE-ONLY — pure counts, no
 * rows, ids, reference codes, narrative or reporter identity (none exists).
 *
 * - `by_status` / `by_case_type` include EVERY known value, zeros included, so
 *   the client can render a complete, stable set of bars.
 * - `by_district` includes ONLY districts with a count > 0 (the server drops the
 *   empty buckets, since Sri Lanka has 25 districts and most are usually empty).
 * - `recent_by_month` is the last 6 calendar months (incl. the current one),
 *   ordered oldest → newest, each as { month: 'YYYY-MM', count }.
 */
export interface Analytics {
  total: number;
  by_status: Record<string, number>;
  by_case_type: Record<string, number>;
  by_district: Record<string, number>;
  recent_by_month: { month: string; count: number }[];
}

export interface AnalyticsResponse {
  success: boolean;
  data: Analytics;
}

/**
 * Staff: fetch the aggregate analytics figures.
 *
 * Uses the AUTHENTICATED staffApi — analytics is staff-only (the server guards
 * GET /analytics with requireStaff). Available to ALL staff roles.
 */
export const fetchAnalytics = () => staffApi.get<AnalyticsResponse>('/analytics');

/**
 * One entry in the ADMIN-only audit trail (server: auditService.listAudit).
 * Mirrors the server projection EXACTLY.
 *
 * PRIVACY: `detail` carries ONLY WHO/WHAT/WHEN metadata by construction (e.g.
 * from/to status, org id, visibility flag) — never case narrative, notes,
 * evidence paths, reference codes or reporter PII (there is no reporter identity
 * in the data model). `actor_name` and `case_reference` are non-sensitive
 * staff/case handles an admin already sees elsewhere. Both may be null (a
 * system/null actor, or a row with no case). We type `detail` loosely because
 * its shape varies per action and screens render it defensively.
 */
export interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  case_id: string | null;
  case_reference: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditListData {
  entries: AuditEntry[];
  has_more: boolean;
}

export interface AuditListResponse {
  success: boolean;
  data: AuditListData;
}

export interface AuditFilters {
  limit?: number;
  offset?: number;
  action?: string;
}

/**
 * Staff (ADMIN ONLY): fetch a page of audit-trail entries, newest first.
 *
 * Uses the AUTHENTICATED staffApi — the audit trail is admin-only (the server
 * guards GET /audit with requireStaff THEN requireRole('admin'), returning 403
 * for non-admins). The client guard on the screen is UX only; the server is the
 * real boundary. `action` maps straight through (it is already a wire value from
 * AUDIT_ACTIONS); empty/undefined params are omitted.
 */
export const fetchAudit = (filters: AuditFilters = {}) => {
  const params: Record<string, string | number> = {};
  if (filters.limit !== undefined) params.limit = filters.limit;
  if (filters.offset !== undefined) params.offset = filters.offset;
  if (filters.action) params.action = filters.action;
  return staffApi.get<AuditListResponse>('/audit', { params });
};

/**
 * The caller's OWN staff profile (server: profileService.toProfile). Mirrors the
 * GET /api/staff/me shape EXACTLY, in snake_case (per the naming rule).
 *
 * SECURITY: there is deliberately NO password_hash field — the self-service
 * surface never returns it. `gender` and `date_of_birth` are DERIVED server-side
 * from the NIC (never client-sent), so they are read-only here. `auth_method`
 * ('password' | 'google') tells the client whether to offer the change-password
 * flow; the server re-checks it (a Google session cannot change a password).
 */
export interface StaffProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  organisation_id: string;
  organisation_name: string | null;
  nic: string | null;
  phone: string | null;
  designation: string | null;
  bar_number: string | null;
  gender: string | null;
  date_of_birth: string | null;
  avatar_url: string | null;
  profile_completed: boolean;
  auth_method: string;
}

export interface StaffProfileResponse {
  success: boolean;
  data: StaffProfile;
}

/**
 * The PATCH /me body — only the fields a staffer may edit. snake_case matches the
 * server exactly (email/role/organisation are read-only; gender/date_of_birth are
 * derived from the NIC server-side and never sent). `bar_number` is only
 * meaningful for attorneys; the server ignores it for other roles.
 */
export interface StaffProfileInput {
  name?: string;
  nic?: string;
  phone?: string;
  designation?: string;
  bar_number?: string;
}

/** Staff: fetch the caller's OWN profile. Token-bearing staffApi (requireStaff). */
export const fetchMe = () => staffApi.get<StaffProfileResponse>('/staff/me');

/**
 * Staff: update the caller's OWN editable fields. The server is the authority —
 * it validates the NIC + mobile and DERIVES gender + date_of_birth, returning a
 * 400 with a `message` the screen surfaces inline on invalid input.
 */
export const updateMe = (input: StaffProfileInput) =>
  staffApi.patch<StaffProfileResponse>('/staff/me', input);

/**
 * The RN image asset shape we accept for an avatar. Mirrors what
 * expo-image-picker returns (uri, plus an optional mimeType/fileName); we only
 * need enough to build the multipart file part.
 */
export interface AvatarAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

export interface AvatarUploadResponse {
  success: boolean;
  data: { avatar_url: string };
}

/**
 * Staff: upload a new avatar. Sends multipart/form-data with the `avatar` field —
 * the same RN { uri, name, type } file shape submitReport uses (a browser File
 * does not exist on native). The server discards the original filename (privacy)
 * and stores under a random key, returning the new public avatar_url.
 */
export const uploadAvatar = (asset: AvatarAsset) => {
  const form = new FormData();
  // Infer a sane content-type + extension when the picker omits them.
  const type = asset.mimeType ?? 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  form.append('avatar', {
    uri: asset.uri,
    name: asset.fileName ?? `avatar.${ext}`,
    type,
  } as unknown as Blob);
  return staffApi.post<AvatarUploadResponse>('/staff/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Staff: change the caller's OWN password. camelCase args map to the server's
 * snake_case body. The server refuses this for Google sessions and validates the
 * current password + new-password length, returning 400 with a `message`. The
 * plaintext passwords are request-only and must never be logged.
 */
export const changeMyPassword = ({
  currentPassword,
  newPassword,
}: {
  currentPassword: string;
  newPassword: string;
}) =>
  staffApi.post<{ success: boolean }>('/staff/me/password', {
    current_password: currentPassword,
    new_password: newPassword,
  });

/** Health check — useful when debugging "is the server up?". */
export const checkHealth = () => api.get('/health');

export default api;
