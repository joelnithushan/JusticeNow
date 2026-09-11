/**
 * JusticeNow (mobile) — In-progress report draft.
 *
 * WHY THIS EXISTS (safety-critical):
 *  - The half-written details of an assault must never be written to disk. This
 *    draft lives ONLY in React state (memory), for the current session. We do
 *    NOT use AsyncStorage, SecureStore, or any persistent storage for it.
 *  - Holding the draft in a context (rather than local component state) lets the
 *    Quick Exit button clear EVERYTHING in one call — `reset()` — no matter
 *    which screen is on top. When the process is killed the memory is gone too.
 *
 * Do not add persistence here. Do not add any field that identifies the
 * reporter (no name, email, phone, or device id).
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { DocumentPickerAsset } from 'expo-document-picker';

export interface ReportDraft {
  // Step 1 — Incident
  reporterType: string; // one of REPORTER_TYPES (required)
  caseType: string; // category, one of CASE_TYPES (required)
  customCategory: string; // only when caseType === 'other'
  title: string; // optional; auto-derived server-side if blank

  // Step 2 — Details
  description: string; // required
  peopleInvolved: string; // optional, non-identifying
  victimInformation: string; // optional

  // Step 3 — Location & Time
  incidentDate: Date | null; // optional; null means "not provided"
  incidentDateApproximate: boolean;
  incidentTime: string; // optional free text (e.g. "around 6pm")
  incidentTimeApproximate: boolean;
  district: string; // optional now
  locationName: string; // optional place name

  // Step 4 — Evidence & Safety
  evidenceFile: DocumentPickerAsset | null; // optional
  evidenceDescription: string; // optional
  otherWitnesses: string; // '' | one of TRISTATE
  witnessDetails: string; // optional
  immediateRisk: string; // '' | one of TRISTATE
  previouslyReported: string; // '' | one of PRIOR_REPORT_SOURCES
  previousReportDetails: string; // optional
  assistanceRequested: string[]; // subset of ASSISTANCE_TYPES
  additionalInformation: string; // optional
}

const EMPTY_DRAFT: ReportDraft = {
  reporterType: '',
  caseType: '',
  customCategory: '',
  title: '',
  description: '',
  peopleInvolved: '',
  victimInformation: '',
  incidentDate: null,
  incidentDateApproximate: false,
  incidentTime: '',
  incidentTimeApproximate: false,
  district: '',
  locationName: '',
  evidenceFile: null,
  evidenceDescription: '',
  otherWitnesses: '',
  witnessDetails: '',
  immediateRisk: '',
  previouslyReported: '',
  previousReportDetails: '',
  assistanceRequested: [],
  additionalInformation: '',
};

interface ReportFormContextValue {
  draft: ReportDraft;
  setField: <K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) => void;
  reset: () => void;
}

const ReportFormContext = createContext<ReportFormContextValue | null>(null);

export function ReportFormProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);

  const setField = useCallback(
    <K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Wipe the whole draft from memory. Called on submit and on Quick Exit.
  const reset = useCallback(() => setDraft(EMPTY_DRAFT), []);

  const value = useMemo(() => ({ draft, setField, reset }), [draft, setField, reset]);

  return <ReportFormContext.Provider value={value}>{children}</ReportFormContext.Provider>;
}

export function useReportForm(): ReportFormContextValue {
  const ctx = useContext(ReportFormContext);
  if (!ctx) {
    throw new Error('useReportForm must be used inside a ReportFormProvider');
  }
  return ctx;
}
