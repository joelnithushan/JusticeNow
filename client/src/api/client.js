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
export const submitReport = ({ caseType, incidentDate, district, description, evidenceFile }) => {
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

/** Health check — useful when debugging "is the server up?". */
export const checkHealth = () => api.get('/health');

export default api;
