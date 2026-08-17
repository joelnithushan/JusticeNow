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

export interface SubmitReportInput {
  caseType: string;
  incidentDate: string; // 'YYYY-MM-DD' or '' when not provided
  district: string;
  description: string;
  evidenceFile: DocumentPickerAsset | null;
}

/**
 * Submit an anonymous case report.
 *
 * Sends multipart/form-data so the optional evidence file can be included.
 * The field names (case_type, district, description, incident_date, evidence)
 * match the server exactly — do not rename them.
 *
 * On React Native a file part is described by { uri, name, type } rather than a
 * browser File object; that shape is what the server's multer middleware reads.
 */
export const submitReport = ({
  caseType,
  incidentDate,
  district,
  description,
  evidenceFile,
}: SubmitReportInput) => {
  const form = new FormData();
  form.append('case_type', caseType);
  form.append('district', district);
  form.append('description', description);
  if (incidentDate) form.append('incident_date', incidentDate);
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

/** Staff: list reports, optionally filtered by case type / status. */
export const fetchReports = (filters: ReportFilters = {}) => {
  const params: Record<string, string> = {};
  if (filters.caseType) params.case_type = filters.caseType;
  if (filters.status) params.status = filters.status;
  return api.get('/reports', { params });
};

/** Health check — useful when debugging "is the server up?". */
export const checkHealth = () => api.get('/health');

export default api;
