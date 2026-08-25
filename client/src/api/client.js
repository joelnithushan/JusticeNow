/**
 * JusticeNow — Axios instance for talking to the Express API.
 *
 * PRIVACY NOTE: there is deliberately NO auth token interceptor here for
 * reporters — reporters never log in. Staff auth will be added in the
 * next sprint as a separate concern.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 15000, // 15s — evidence uploads can be slow on mobile data
});

/**
 * Submit an anonymous case report.
 * Sends multipart/form-data so the optional evidence file can be included.
 */
export const submitReport = ({
  caseType,
  incidentDate,
  district,
  description,
  evidenceFile,
}) => {
  const form = new FormData();
  form.append('case_type', caseType);
  form.append('district', district);
  form.append('description', description);
  if (incidentDate) form.append('incident_date', incidentDate);
  if (evidenceFile) form.append('evidence', evidenceFile);
  return api.post('/reports', form);
};

/** Staff: list reports, optionally filtered by case type / status. */
export const fetchReports = (filters = {}) => {
  const params = {};
  if (filters.caseType) params.case_type = filters.caseType;
  if (filters.status) params.status = filters.status;
  return api.get('/reports', { params });
};

/**
 * Fetch the status of an anonymous case by its reference code.
 * The code is passed as a URL parameter, never in a request body or header,
 * and is never stored in localStorage/sessionStorage.
 *
 * @param {string} referenceCode – the code the reporter received at submission
 */
export const fetchCaseStatus = (referenceCode) =>
  api.get(`/status/${encodeURIComponent(referenceCode)}`);

// ── Staff case-management (JNOW-13) ──────────────────────────────────────────
// These endpoints are staff-only: the server verifies a Supabase session, so
// every call must carry the staff access token as a Bearer header. The token
// comes from AuthContext (session.access_token) — never from storage we manage.
const authConfig = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

/** Staff: fetch a single case by id (for the detail view). */
export const fetchReport = (id, token) => api.get(`/reports/${id}`, authConfig(token));

/** Staff: change a case's workflow status. */
export const updateReportStatus = (id, status, token) =>
  api.patch(`/reports/${id}/status`, { status }, authConfig(token));

/** Staff: list a case's notes, newest first (includes internal notes). */
export const fetchCaseNotes = (id, token) =>
  api.get(`/reports/${id}/notes`, authConfig(token));

/**
 * Staff: add a note to a case.
 * isReporterVisible defaults to false — an internal note unless explicitly set.
 */
export const addCaseNote = (id, { note, isReporterVisible = false }, token) =>
  api.post(
    `/reports/${id}/notes`,
    { note, is_reporter_visible: isReporterVisible },
    authConfig(token),
  );

/** Health check — useful when debugging "is the server up?". */
export const checkHealth = () => api.get('/health');

export default api;
