/**
 * JusticeNow — Shared client constants.
 * These values must match server/constants.js and docs/schema.sql.
 */

// Values sent to the API; labels come from i18n ("caseTypes.<value>").
export const CASE_TYPES = [
  'harassment',
  'unlawful_detention',
  'land_dispute',
  'discrimination',
  'official_misconduct',
  'other',
];

// The 25 administrative districts of Sri Lanka.
export const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
  'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
  'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];
