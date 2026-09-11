/**
 * JusticeNow — Staff accounts admin service (U11).
 *
 * Owns all Supabase access for ADMIN staff-account CRUD (list / create / update
 * / deactivate). ONLY staff (attorney/officer/admin) exist as accounts —
 * reporters never have one, by design. Every function here is reached ONLY
 * through requireRole('admin') routes; this service assumes an authorised admin
 * caller (the route is the real boundary).
 *
 * PRIVACY / SECURITY:
 *  - password_hash is NEVER returned to a caller and NEVER logged. The safe
 *    projection (SAFE_STAFF_COLUMNS) deliberately omits it.
 *  - The plaintext password is bcrypt-hashed here and never stored or logged.
 *  - Audit `detail` written by the controller carries only { staff_id, role } —
 *    never the email, password or hash.
 *
 * Mirrors organisationService.js in structure (ValidationError / NotFoundError,
 * a shared buildStaffPatch, soft-delete only) so the two admin surfaces read the
 * same way.
 */

const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { STAFF_ROLES } = require('./statusTransition');

// bcrypt work factor. 10 matches the seed script (scripts/seed.js) — a sane
// default for this app; raising it later only affects newly-created hashes.
const BCRYPT_COST = 10;

// Minimum password length enforced server-side (the authority). The client
// mirrors this hint, but this check is what actually protects the account.
const MIN_PASSWORD_LENGTH = 8;

// A deliberately permissive email shape: exactly one @, non-empty local part,
// and a dotted domain. Full RFC validation is pointless — the real proof is a
// working inbox — so we only reject obviously malformed values.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Postgres unique-violation SQLSTATE. A duplicate email hits the staff_users
// UNIQUE(email) constraint; we translate it to a friendly 400 rather than a 500.
const PG_UNIQUE_VIOLATION = '23505';

// The columns an admin may receive for a staff account. password_hash is
// deliberately ABSENT — it must never leave the server. is_active is included
// so the console can badge/toggle deactivated accounts.
const SAFE_STAFF_COLUMNS =
  'id, name, email, role, organisation_id, is_active, created_at';

/** A validation error the controller maps to a 400 (mirrors organisationService). */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/** A not-found error the controller maps to a 404 (mirrors organisationService). */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

/** A forbidden error the controller maps to a 403 (org-scope violation). */
class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

// The platform superadmin role: unrestricted across every org. The only OTHER
// role that reaches this admin surface (per the route guard) is 'org_admin',
// which is scoped to its own organisation.
const PLATFORM_ADMIN = 'admin';

// The roles an org_admin is allowed to CREATE within their own org. Notably
// EXCLUDES 'admin' (platform superadmin) — an org_admin must never be able to
// mint a platform-wide account.
const ORG_ADMIN_CREATABLE_ROLES = ['officer', 'attorney', 'org_admin'];

/**
 * Is the caller the PLATFORM admin (unrestricted)? A missing caller defaults to
 * unrestricted for backward-compat with any internal call that predates
 * org-scoping — but every real route now passes req.staff.
 *
 * @param {?{ role?: string }} caller
 * @returns {boolean}
 */
function isPlatformAdmin(caller) {
  return !caller || caller.role === PLATFORM_ADMIN;
}

/**
 * Translate a Supabase write error to the right typed error. A duplicate email
 * (unique violation) is a client error (400) with a friendly message; anything
 * else is an unexpected server error the controller maps to 500. Never leaks the
 * raw DB text of a unique violation (which could echo the email).
 *
 * @param {object} error   the Supabase error object
 * @param {string} context prefix for the server-side 500 message
 * @throws {ValidationError|Error}
 */
function throwWriteError(error, context) {
  if (error.code === PG_UNIQUE_VIOLATION) {
    throw new ValidationError('That email is already registered.');
  }
  throw new Error(`${context}: ${error.message}`);
}

/**
 * Validate and normalise the staff fields shared by create/update.
 *
 * Only fields PRESENT in `input` are validated, so this serves a full create
 * (`isCreate = true`, where name/email/role/organisation_id/password are
 * required) and a partial update alike. Returns a snake_case patch ready to
 * insert/update. The password (when supplied) is bcrypt-hashed into
 * `password_hash`; the plaintext never leaves this function.
 *
 * @param {object}  input  raw request body (snake_case fields)
 * @param {object}  [opts]
 * @param {boolean} [opts.isCreate]  when true, the core fields are required
 * @returns {Promise<object>} a validated, normalised snake_case patch
 * @throws {ValidationError} on any invalid field
 */
async function buildStaffPatch(input, { isCreate = false, passwordRequired = isCreate } = {}) {
  const src = input || {};
  const patch = {};

  // name — required non-empty on create; if provided on update, non-empty.
  if (isCreate || src.name !== undefined) {
    const name = typeof src.name === 'string' ? src.name.trim() : '';
    if (!name) {
      throw new ValidationError('name is required and cannot be empty.');
    }
    patch.name = name;
  }

  // email — required on create; normalised to lowercase; basic shape check.
  if (isCreate || src.email !== undefined) {
    const email = typeof src.email === 'string' ? src.email.trim().toLowerCase() : '';
    if (!email) {
      throw new ValidationError('email is required.');
    }
    if (!EMAIL_SHAPE.test(email)) {
      throw new ValidationError('email must be a valid email address.');
    }
    patch.email = email;
  }

  // role — required on create; must be one of the shared STAFF_ROLES.
  if (isCreate || src.role !== undefined) {
    const role = typeof src.role === 'string' ? src.role.trim() : '';
    if (!STAFF_ROLES.includes(role)) {
      throw new ValidationError(`role must be one of: ${STAFF_ROLES.join(', ')}.`);
    }
    patch.role = role;
  }

  // organisation_id — required on create; must reference an EXISTING org. We
  // look it up so a bad id is a clear 400 here rather than a foreign-key 500
  // surfacing from the insert.
  if (isCreate || src.organisation_id !== undefined) {
    const organisationId =
      typeof src.organisation_id === 'string' ? src.organisation_id.trim() : '';
    if (!organisationId) {
      throw new ValidationError('organisation_id is required.');
    }
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('id')
      .eq('id', organisationId)
      .maybeSingle();
    if (orgError) {
      throw new Error(`Organisation lookup failed: ${orgError.message}`);
    }
    if (!org) {
      throw new ValidationError(
        'organisation_id must reference an existing organisation.',
      );
    }
    patch.organisation_id = organisationId;
  }

  // password — required when passwordRequired (create, except Google signup which
  // has no password); optional on update (blank/absent = unchanged). When present
  // it is hashed to password_hash; the plaintext is never stored.
  if (passwordRequired || src.password !== undefined) {
    const password = typeof src.password === 'string' ? src.password : '';
    if (passwordRequired || password !== '') {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new ValidationError(
          `password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        );
      }
      patch.password_hash = await bcrypt.hash(password, BCRYPT_COST);
    }
  }

  // is_active — update only, and only when explicitly supplied. Coerced to a
  // strict boolean since the body value is client-controlled.
  if (!isCreate && src.is_active !== undefined) {
    patch.is_active = Boolean(src.is_active);
  }

  return patch;
}

/**
 * ADMIN: list staff accounts (active AND inactive), name-ordered, enriched with
 * their organisation's name for display.
 *
 * SCOPE: a platform admin sees EVERY account; an org_admin sees ONLY the staff
 * in their OWN organisation (filtered here, on the server — the boundary is not
 * the client). NEVER returns password_hash (see SAFE_STAFF_COLUMNS).
 *
 * @param {?{ role?: string, org?: string }} caller  the acting staff member
 * @returns {Promise<object[]>} the safe projection of each visible account, each
 *   with an added `organisation_name` (or null if the org row is missing).
 */
async function listStaff(caller) {
  let query = supabase
    .from('staff_users')
    .select(SAFE_STAFF_COLUMNS)
    .order('name', { ascending: true });

  // org_admin scoping: restrict the list to the caller's own org. A platform
  // admin skips this filter and sees everyone.
  if (!isPlatformAdmin(caller)) {
    query = query.eq('organisation_id', caller.org);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Staff list failed: ${error.message}`);
  }

  const rows = data || [];

  // Enrich with the org NAME (a non-sensitive public label) so the admin list
  // can show which org each account belongs to. Batch-lookup to avoid N queries.
  const orgIds = [...new Set(rows.map((r) => r.organisation_id).filter(Boolean))];
  const orgNames = new Map();
  if (orgIds.length > 0) {
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id, name')
      .in('id', orgIds);
    if (orgError) {
      throw new Error(`Staff org-name lookup failed: ${orgError.message}`);
    }
    for (const org of orgs || []) {
      orgNames.set(org.id, org.name);
    }
  }

  return rows.map((r) => ({
    ...r,
    organisation_name: r.organisation_id
      ? orgNames.get(r.organisation_id) || null
      : null,
  }));
}

/**
 * ADMIN: create a staff account.
 *
 * SCOPE (org_admin): the new account is FORCED into the org_admin's own org
 * (any organisation_id in the body is ignored) and the role is restricted to
 * officer/attorney/org_admin — an org_admin can NEVER create a platform admin.
 * A platform admin is unrestricted (may set any org / role).
 *
 * @param {object} input   snake_case fields (name, email, role, organisation_id, password)
 * @param {?{ role?: string, org?: string }} caller  the acting staff member
 * @returns {Promise<object>} the created account in the safe projection (no hash).
 * @throws {ValidationError} on invalid input or a duplicate email (400).
 * @throws {ForbiddenError}  when an org_admin tries to create a platform admin (403).
 */
async function createStaff(input, caller) {
  const src = { ...(input || {}) };

  if (!isPlatformAdmin(caller)) {
    // An org_admin may only mint officer/attorney/org_admin — never a platform
    // admin. Reject BEFORE any DB touch so it cannot leak through validation.
    const requestedRole = typeof src.role === 'string' ? src.role.trim() : '';
    if (!ORG_ADMIN_CREATABLE_ROLES.includes(requestedRole)) {
      throw new ForbiddenError(
        'You may only create officer, attorney, or organisation admin accounts in your organisation.',
      );
    }
    // FORCE the caller's own org — an org_admin cannot plant staff in another org.
    src.organisation_id = caller.org;
  }

  const patch = await buildStaffPatch(src, { isCreate: true });

  const { data, error } = await supabase
    .from('staff_users')
    .insert(patch)
    .select(SAFE_STAFF_COLUMNS)
    .single();

  if (error) {
    throwWriteError(error, 'Staff create failed');
  }

  return data;
}

/**
 * ADMIN: update a staff account (partial). May change name/email/role/
 * organisation_id/is_active, and rehashes the password if one is supplied.
 *
 * SCOPE (org_admin): may only update a row in their OWN org; a row in another
 * org is treated as NOT FOUND (a generic 404 — we do not reveal it exists). An
 * org_admin may not promote anyone to platform admin, nor move a staffer to
 * another org (both 403). A platform admin is unrestricted.
 *
 * @param {string} id     the staff uuid
 * @param {object} input  the snake_case fields to change
 * @param {?{ role?: string, org?: string }} caller  the acting staff member
 * @returns {Promise<object>} the updated account in the safe projection (no hash).
 * @throws {ValidationError} on invalid input or a duplicate email (400).
 * @throws {NotFoundError}   when the id matches no account (or is out of scope).
 * @throws {ForbiddenError}  when an org_admin tries a platform-admin/cross-org move.
 */
async function updateStaff(id, input, caller) {
  const trimmedId = (id || '').trim();
  if (!trimmedId) {
    throw new NotFoundError('Staff member not found.');
  }

  // org_admin scoping: load the target's org first. A target in a DIFFERENT org
  // is a 404 (do not reveal it exists), and any attempt to grant platform admin
  // or move the row to another org is a 403.
  if (!isPlatformAdmin(caller)) {
    const { data: target, error: targetError } = await supabase
      .from('staff_users')
      .select('id, organisation_id')
      .eq('id', trimmedId)
      .maybeSingle();
    if (targetError) {
      throw new Error(`Staff lookup failed: ${targetError.message}`);
    }
    if (!target || target.organisation_id !== caller.org) {
      throw new NotFoundError('Staff member not found.');
    }
    if (input && input.role !== undefined && input.role === PLATFORM_ADMIN) {
      throw new ForbiddenError('You may not grant platform admin.');
    }
    if (
      input &&
      input.organisation_id !== undefined &&
      String(input.organisation_id).trim() !== caller.org
    ) {
      throw new ForbiddenError('You may not move a staff member to another organisation.');
    }
  }

  const patch = await buildStaffPatch(input, { isCreate: false });

  const { data, error } = await supabase
    .from('staff_users')
    .update(patch)
    .eq('id', trimmedId)
    .select(SAFE_STAFF_COLUMNS)
    .maybeSingle();

  if (error) {
    throwWriteError(error, 'Staff update failed');
  }
  if (!data) {
    throw new NotFoundError('Staff member not found.');
  }

  return data;
}

/**
 * ADMIN: SOFT-delete (deactivate) a staff account by clearing is_active.
 *
 * WHY SOFT DELETE (never a DB DELETE): audit_log.actor_id references
 * staff_users(id) ON DELETE SET NULL (see docs/schema.sql), so a hard DELETE
 * would strip the actor from every audit entry this person ever wrote —
 * destroying accountability. Deactivating instead blocks the account's login
 * (services/auth.js rejects an inactive account) while preserving the trail.
 * NEVER replace this with supabase.delete().
 *
 * GUARDS (both return 400 with a specific message the client surfaces):
 *  - An admin may NOT deactivate their OWN account. WHY: it is an instant
 *    self-lockout, and it is almost always a mistake — deactivating yourself
 *    would drop your own session's account out from under you.
 *  - An admin may NOT deactivate the LAST active admin. WHY: the app would be
 *    left with no one able to manage orgs/staff or reopen closed cases — an
 *    unrecoverable state through the UI. We count active admins first.
 *
 * SCOPE (org_admin): may only deactivate a staffer in their OWN org; a target
 * in another org is a generic 404 (we do not reveal it exists). A platform
 * admin is unrestricted.
 *
 * @param {string} id           the staff uuid to deactivate
 * @param {?{ id?: string, role?: string, org?: string }} actingStaff  the caller
 * @returns {Promise<object>} the deactivated account in the safe projection.
 * @throws {ValidationError} on a self / last-admin guard (400).
 * @throws {NotFoundError}   when the id matches no account (or is out of scope).
 */
async function deactivateStaff(id, actingStaff) {
  const trimmedId = (id || '').trim();
  if (!trimmedId) {
    throw new NotFoundError('Staff member not found.');
  }

  const actingId = (actingStaff && actingStaff.id) || '';

  // Self-lockout guard: a staffer cannot deactivate their own account.
  if (trimmedId === String(actingId).trim()) {
    throw new ValidationError('You cannot deactivate your own account.');
  }

  // Load the target first so we can (a) 404 a missing id, (b) know whether it is
  // an admin before applying the last-admin guard, and (c) org-scope org_admin.
  const { data: target, error: targetError } = await supabase
    .from('staff_users')
    .select('id, role, is_active, organisation_id')
    .eq('id', trimmedId)
    .maybeSingle();

  if (targetError) {
    throw new Error(`Staff lookup failed: ${targetError.message}`);
  }
  if (!target) {
    throw new NotFoundError('Staff member not found.');
  }

  // org_admin scoping: a target outside the caller's org is a generic 404.
  if (!isPlatformAdmin(actingStaff) && target.organisation_id !== actingStaff.org) {
    throw new NotFoundError('Staff member not found.');
  }

  // Last-active-admin guard: if the target is an active admin, ensure at least
  // one OTHER active admin remains. count: 'exact', head: true asks Postgres for
  // the count only (no rows), which is enough to decide.
  if (target.role === 'admin' && target.is_active !== false) {
    const { count, error: countError } = await supabase
      .from('staff_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);

    if (countError) {
      throw new Error(`Active-admin count failed: ${countError.message}`);
    }
    if ((count || 0) <= 1) {
      throw new ValidationError(
        'You cannot deactivate the last active admin. Promote another admin first.',
      );
    }
  }

  const { data, error } = await supabase
    .from('staff_users')
    // Soft delete: flip the flag, never remove the row (would break the audit
    // trail's actor references — see the function header).
    .update({ is_active: false })
    .eq('id', trimmedId)
    .select(SAFE_STAFF_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Staff deactivate failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError('Staff member not found.');
  }

  return data;
}

// The roles a person may pick when SELF-registering. Excludes 'admin': the
// platform superadmin is never self-served — it is provisioned out of band.
const SELF_REGISTERABLE_ROLES = ['org_admin', 'attorney', 'officer'];

/**
 * SELF-SERVICE: register a new staff account (PENDING admin approval).
 *
 * SECURITY: staff accounts grant access to confidential case data, so a
 * self-registered account is created INACTIVE (is_active = false). It cannot log
 * in — both authenticateStaff and authenticateGoogle reject inactive rows — until
 * a platform/org admin activates it. The role is restricted to
 * officer/attorney/org_admin; 'admin' can never be self-registered. profile_
 * completed stays false so the completion gate runs on first login after
 * activation. There is NO caller: this is a public endpoint.
 *
 * @param {object} input  snake_case { name, email, role, organisation_id, password? }
 * @param {{ google?: boolean }} [opts]  google=true → no password (Google is the
 *        credential); the caller MUST pass the Google-verified email in `input`.
 * @returns {Promise<object>} minimal projection of the created (inactive) account.
 * @throws {ValidationError} invalid role/fields or duplicate email (400).
 */
async function registerStaff(input, { google = false } = {}) {
  const src = { ...(input || {}) };

  const role = typeof src.role === 'string' ? src.role.trim() : '';
  if (!SELF_REGISTERABLE_ROLES.includes(role)) {
    throw new ValidationError(
      `role must be one of: ${SELF_REGISTERABLE_ROLES.join(', ')}.`,
    );
  }

  // Reuse the shared validator (name/email/role/org required + org existence).
  // Google signups have no password — the OAuth token is the credential.
  const patch = await buildStaffPatch(src, { isCreate: true, passwordRequired: !google });

  // PENDING APPROVAL: created inactive; an admin flips is_active to activate.
  patch.is_active = false;
  patch.profile_completed = false;

  const { data, error } = await supabase
    .from('staff_users')
    .insert(patch)
    .select('id, name, email, role, organisation_id, is_active')
    .single();

  if (error) {
    throwWriteError(error, 'Staff registration failed');
  }

  return data;
}

module.exports = {
  listStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  registerStaff,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  SAFE_STAFF_COLUMNS,
  MIN_PASSWORD_LENGTH,
  SELF_REGISTERABLE_ROLES,
};
