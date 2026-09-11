/**
 * JusticeNow — Shared client constants.
 * These values must match server/constants.js and docs/schema.sql.
 */

// Case categories sent to the API; labels come from i18n ("caseTypes.<value>").
// UNION of the original categories (kept so existing rows never break) and the
// wider set from the expanded reporting flow. Keep identical to
// server/constants.js and mobile/src/constants.ts.
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
];

// Case workflow statuses. MUST stay identical to server/constants.js
// CASE_STATUSES (which mirrors the case_reports.status CHECK constraint). Values
// are the wire values; labels are resolved via t(`statuses.${value}`).
export const CASE_STATUSES = [
  'received',
  'under_review',
  'referred',
  'closed',
];

// Staff roles. MUST stay identical to server STAFF_ROLES, which mirrors the
// staff_users.role CHECK constraint. Values are the wire values; labels are
// resolved via t(`roles.${value}`).
export const STAFF_ROLES = ['officer', 'attorney', 'admin'];

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
];

// The 25 administrative districts of Sri Lanka.
export const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
  'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
  'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];
