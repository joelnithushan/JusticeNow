/**
 * JusticeNow (mobile) — Shared constants.
 *
 * These MUST stay identical to /client/src/constants.js and
 * /server/constants.js. The values here are the wire values sent to the API;
 * the human-readable labels come from i18n ("caseTypes.<value>").
 *
 * Do NOT redeclare these lists anywhere else in the app — import from here.
 */

// Values sent to the API. Labels are resolved via t(`caseTypes.${value}`).
export const CASE_TYPES = [
  'harassment',
  'unlawful_detention',
  'land_dispute',
  'discrimination',
  'official_misconduct',
  'other',
] as const;

export type CaseType = (typeof CASE_TYPES)[number];

// The 25 administrative districts of Sri Lanka.
export const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
  'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
  'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
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
