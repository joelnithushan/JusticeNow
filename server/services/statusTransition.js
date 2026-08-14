/**
 * JusticeNow — Case status state machine (single source of truth).
 *
 * The lifecycle of a case is:
 *
 *     received -> under_review -> referred -> closed
 *
 * with some backward moves allowed. This module is the ONE place that decides
 * whether a status change is permitted. Do not scatter status comparisons
 * across controllers — call canTransition() instead. Centralising it means an
 * invariant like "only an admin may reopen a closed case" cannot be quietly
 * broken by a new endpoint that forgot the rule.
 *
 * NOTE: this module is pure and intentionally NOT yet wired into any route.
 * The status-change endpoint is a later story; this is the canonical guard it
 * will call, and the reference the tests pin down now.
 */

// Case statuses — must mirror the case_reports.status CHECK constraint
// in docs/schema.sql.
const STATUSES = ['received', 'under_review', 'referred', 'closed'];

// Staff roles — must mirror the staff_users.role CHECK constraint.
const STAFF_ROLES = ['officer', 'attorney', 'admin'];
const ADMIN_ONLY = ['admin'];

/**
 * Allowed transitions: transitions[from][to] = list of roles permitted.
 *
 * - Any staff member may move a case forward, or close it.
 * - A referred case may be pulled back to under_review (with a reason — see
 *   note below), or closed.
 * - Only an admin may reopen a closed case.
 */
const transitions = {
  received: {
    under_review: STAFF_ROLES,
    closed: STAFF_ROLES,
  },
  under_review: {
    referred: STAFF_ROLES,
    closed: STAFF_ROLES,
  },
  referred: {
    // Backward move — allowed for staff, but the caller MUST record a reason.
    // canTransition only checks role; the service layer enforces the reason,
    // because a reason is data, not an authorisation decision.
    under_review: STAFF_ROLES,
    closed: STAFF_ROLES,
  },
  closed: {
    under_review: ADMIN_ONLY, // reopening is an admin-only action
  },
};

/**
 * Can a case move from `from` to `to`, performed by someone with `role`?
 *
 * @param {string} from  current status
 * @param {string} to    desired status
 * @param {string} role  the actor's staff role
 * @returns {boolean} true only if the transition exists AND the role is allowed
 */
function canTransition(from, to, role) {
  const allowedRoles = transitions[from] && transitions[from][to];
  if (!allowedRoles) {
    return false; // no such edge (includes staying in the same status)
  }
  return allowedRoles.includes(role);
}

module.exports = { STATUSES, STAFF_ROLES, transitions, canTransition };
