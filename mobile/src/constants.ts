/**
 * JusticeNow (mobile) — Shared constants.
 *
 * These MUST stay identical to /client/src/constants.js and
 * /server/constants.js. The values here are the wire values sent to the API;
 * the human-readable labels come from i18n ("caseTypes.<value>").
 *
 * Do NOT redeclare these lists anywhere else in the app — import from here.
 */

// Case categories sent to the API (the DB column is still `case_type`). Labels
// are resolved via t(`caseTypes.${value}`). This is the UNION of the original
// categories (kept so existing rows + org routing never break) and the wider set
// from the expanded reporting flow. 'other' pairs with a free-text customCategory.
export const CASE_TYPES = [
  'harassment',
  'violence',
  'domestic_violence',
  'sexual_abuse',
  'discrimination',
  'child_protection',
  'corruption',
  'abuse_of_authority',
  'human_rights_violation',
  'workplace_abuse',
  'cyber_harassment',
  'unlawful_detention',
  'land_dispute',
  'official_misconduct',
  'other',
] as const;

export type CaseType = (typeof CASE_TYPES)[number];

// Who is filing the report. Never proves identity — just context that helps
// staff (e.g. a victim vs a witness). Labels via t(`reporterTypes.${value}`).
export const REPORTER_TYPES = [
  'victim',
  'witness',
  'third_party',
  'informed',
  'prefer_not_to_say',
] as const;

export type ReporterType = (typeof REPORTER_TYPES)[number];

// Types of help a reporter may request (multi-select). A preference only — never
// a guarantee. Labels via t(`assistanceTypes.${value}`).
export const ASSISTANCE_TYPES = [
  'legal',
  'protection',
  'counselling',
  'investigation',
  'medical',
  'authorities',
  'advice',
  'other',
  'not_sure',
] as const;

export type AssistanceType = (typeof ASSISTANCE_TYPES)[number];

// Small yes/no/unsure controls (immediate risk, other witnesses). Labels via
// t(`triState.${value}`).
export const TRISTATE = ['yes', 'no', 'not_sure'] as const;
export type TriState = (typeof TRISTATE)[number];

// Where an incident may already have been reported. Labels via
// t(`priorReport.${value}`).
export const PRIOR_REPORT_SOURCES = [
  'none',
  'police',
  'ngo',
  'government',
  'school',
  'workplace',
  'other',
  'prefer_not_to_say',
] as const;

export type PriorReportSource = (typeof PRIOR_REPORT_SOURCES)[number];

// Case workflow statuses. MUST stay identical to server/constants.js
// CASE_STATUSES (which mirrors the case_reports.status CHECK constraint). Values
// are the wire values; labels are resolved via t(`statuses.${value}`).
export const CASE_STATUSES = [
  'received',
  'under_review',
  'referred',
  'closed',
] as const;

export type CaseStatusValue = (typeof CASE_STATUSES)[number];

// Staff roles. MUST stay identical to server STAFF_ROLES (services/
// statusTransition.js), which mirrors the staff_users.role CHECK constraint.
// Values are the wire values; labels are resolved via t(`roles.${value}`).
export const STAFF_ROLES = ['officer', 'attorney', 'admin'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

// The 25 administrative districts of Sri Lanka.
export const DISTRICTS = [
  'Ampara',
  'Anuradhapura',
  'Badulla',
  'Batticaloa',
  'Colombo',
  'Galle',
  'Gampaha',
  'Hambantota',
  'Jaffna',
  'Kalutara',
  'Kandy',
  'Kegalle',
  'Kilinochchi',
  'Kurunegala',
  'Mannar',
  'Matale',
  'Matara',
  'Monaragala',
  'Mullaitivu',
  'Nuwara Eliya',
  'Polonnaruwa',
  'Puttalam',
  'Ratnapura',
  'Trincomalee',
  'Vavuniya',
] as const;

// Evidence upload rules. These are the CLIENT-side rules for fast feedback;
// the server remains the authority. JPG/PNG/WebP/PDF only, 5 MB maximum.
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_EVIDENCE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

// Minimum length of the description, mirrored on the server-side check.
export const MIN_DESCRIPTION_LENGTH = 20;

// Audit trail actions. MUST stay identical to server/constants.js AUDIT_ACTIONS.
// The audit `detail` never carries narrative, evidence paths, reference codes
// or reporter PII — only WHO/WHAT/WHEN metadata.
export const AUDIT_ACTIONS = [
  'status_changed',
  'note_added',
  'case_assigned',
  'org_created',
  'org_updated',
  'org_deleted',
  'staff_created',
  'staff_updated',
  'staff_deleted',
  'staff_login',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
