/**
 * JusticeNow — Shared server constants.
 *
 * These values MUST mirror the CHECK constraints in docs/schema.sql.
 * If the schema changes, update this file in the same PR.
 */

// Valid case types (mirrors case_reports.case_type CHECK constraint).
const CASE_TYPES = [
  'harassment',
  'unlawful_detention',
  'land_dispute',
  'discrimination',
  'official_misconduct',
  'other',
];

// Valid case statuses (mirrors case_reports.status CHECK constraint).
const CASE_STATUSES = ['received', 'under_review', 'referred', 'closed'];

// The 25 administrative districts of Sri Lanka.
const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
  'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
  'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

module.exports = { CASE_TYPES, CASE_STATUSES, DISTRICTS };
