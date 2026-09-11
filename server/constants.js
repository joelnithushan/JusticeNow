/**
 * JusticeNow — Shared server constants.
 *
 * These values MUST mirror the CHECK constraints in docs/schema.sql.
 * If the schema changes, update this file in the same PR.
 */

// Valid case categories (mirrors case_reports.case_type CHECK constraint). UNION
// of the original categories (kept so existing rows + org routing never break)
// and the wider set from the expanded reporting flow. Keep identical to
// mobile/src/constants.ts and client/src/constants.js.
const CASE_TYPES = [
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
];

// Who is filing the report (context only — never proves identity).
const REPORTER_TYPES = ['victim', 'witness', 'third_party', 'informed', 'prefer_not_to_say'];

// Types of help a reporter may request (multi-select preference, not a guarantee).
const ASSISTANCE_TYPES = [
  'legal', 'protection', 'counselling', 'investigation', 'medical',
  'authorities', 'advice', 'other', 'not_sure',
];

// Small yes/no/unsure controls (immediate risk, other witnesses).
const TRISTATE = ['yes', 'no', 'not_sure'];

// Where an incident may already have been reported.
const PRIOR_REPORT_SOURCES = [
  'none', 'police', 'ngo', 'government', 'school', 'workplace', 'other', 'prefer_not_to_say',
];

// Valid case statuses (mirrors case_reports.status CHECK constraint). Unchanged:
// the 4-status workflow drives canTransition, the DB CHECK, and staff controls.
const CASE_STATUSES = ['received', 'under_review', 'referred', 'closed'];

// The 25 administrative districts of Sri Lanka.
const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
  'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
  'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

// Audit trail actions. Every audited mutation records exactly one of these as
// its `action`. Keep this list in sync with mobile/src/constants.ts.
// The audit `detail` must NEVER carry narrative, evidence paths, reference
// codes or reporter PII — only WHO/WHAT/WHEN metadata.
const AUDIT_ACTIONS = [
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
  'staff_registered',
];

module.exports = {
  CASE_TYPES,
  REPORTER_TYPES,
  ASSISTANCE_TYPES,
  TRISTATE,
  PRIOR_REPORT_SOURCES,
  CASE_STATUSES,
  DISTRICTS,
  AUDIT_ACTIONS,
};
