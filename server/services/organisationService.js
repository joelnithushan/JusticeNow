/**
 * JusticeNow — Legal resource directory service.
 *
 * Owns all Supabase access for the PUBLIC organisation directory: the list of
 * active legal-aid organisations and NGOs an anonymous reporter can browse, plus
 * a single organisation's detail.
 *
 * PUBLIC BY DESIGN: unlike case data, organisations are public legal-aid
 * contacts — there is no anonymity concern about the org rows themselves. But
 * we still expose only ACTIVE orgs and only the public columns (never internal
 * bookkeeping), and this endpoint carries NO staff token: reporters never
 * authenticate.
 */

const supabase = require('../config/supabase');
const { CASE_TYPES, DISTRICTS } = require('../constants');

// The public columns a reporter may receive for an organisation. Everything the
// directory shows comes from this projection; is_active is used only as a filter
// and is intentionally NOT returned (a reporter never sees inactive orgs).
const PUBLIC_ORG_COLUMNS =
  'id, name, description, district, case_types, contact_phone, contact_email';

// The admin projection: the public columns PLUS is_active, so the admin console
// can show inactive orgs with a badge and toggle them back on. Reporters NEVER
// receive is_active (see PUBLIC_ORG_COLUMNS) — only authenticated admins do.
const ADMIN_ORG_COLUMNS = `${PUBLIC_ORG_COLUMNS}, is_active`;

/**
 * A validation error the controller maps to a 400. Mirrors how the reports
 * controller rejects bad list filters with a helpful message (status = 400).
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/**
 * A not-found error the controller maps to a generic 404 (mirrors caseService).
 * Used by the admin update/deactivate paths when the id matches no org.
 */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

/**
 * Validate and normalise a set of organisation fields shared by create/update.
 *
 * Only the fields PRESENT in `input` are validated, so this works for both a
 * full create (`isCreate = true`, where `name`/`district` are required) and a
 * partial update. Returns a snake_case patch object ready to insert/update;
 * fields that were not supplied are simply absent from the returned object.
 *
 * @param {object} input       the raw request body (snake_case fields)
 * @param {object} [opts]
 * @param {boolean} [opts.isCreate]  when true, name + district are required
 * @returns {object} a validated, normalised patch (snake_case)
 * @throws {ValidationError} on any invalid field
 */
function buildOrgPatch(input, { isCreate = false } = {}) {
  const src = input || {};
  const patch = {};

  // name — required non-empty on create; if provided on update it must be
  // non-empty (you cannot blank out an org's name).
  if (isCreate || src.name !== undefined) {
    const name = typeof src.name === 'string' ? src.name.trim() : '';
    if (!name) {
      throw new ValidationError('name is required and cannot be empty.');
    }
    patch.name = name;
  }

  // district — required on create; if provided it must be a known district.
  if (isCreate || src.district !== undefined) {
    const district = typeof src.district === 'string' ? src.district.trim() : '';
    if (!district) {
      throw new ValidationError('district is required.');
    }
    if (!DISTRICTS.includes(district)) {
      throw new ValidationError('district must be a valid Sri Lankan district.');
    }
    patch.district = district;
  }

  // case_types — optional; when provided must be an array whose EVERY value is a
  // known case type. An empty array is valid (an org that handles nothing yet).
  if (isCreate || src.case_types !== undefined) {
    const caseTypes = src.case_types === undefined ? [] : src.case_types;
    if (!Array.isArray(caseTypes)) {
      throw new ValidationError('case_types must be an array.');
    }
    for (const value of caseTypes) {
      if (!CASE_TYPES.includes(value)) {
        throw new ValidationError(
          `case_types must contain only: ${CASE_TYPES.join(', ')}.`,
        );
      }
    }
    patch.case_types = caseTypes;
  }

  // Optional free-text contact fields. Trim to a string, or null when cleared.
  for (const field of ['description', 'contact_phone', 'contact_email']) {
    if (src[field] !== undefined) {
      const value = typeof src[field] === 'string' ? src[field].trim() : '';
      patch[field] = value || null;
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
 * List active organisations, optionally filtered by district and/or case type.
 *
 * @param {object} [filters]
 * @param {string} [filters.district]  exact district (validated against DISTRICTS)
 * @param {string} [filters.caseType]  a case type the org handles (validated against CASE_TYPES)
 * @returns {Promise<object[]>} the public projection of each matching active org.
 * @throws {ValidationError} when a supplied filter is not a known value.
 */
async function listOrganisations({ district, caseType } = {}) {
  // Validate filters so a typo returns a helpful 400 instead of an empty list
  // (same rationale as reportsController.listReports).
  if (district && !DISTRICTS.includes(district)) {
    throw new ValidationError('district filter must be a valid Sri Lankan district.');
  }
  if (caseType && !CASE_TYPES.includes(caseType)) {
    throw new ValidationError(
      `case_type filter must be one of: ${CASE_TYPES.join(', ')}.`
    );
  }

  let query = supabase
    .from('organisations')
    .select(PUBLIC_ORG_COLUMNS)
    // Only active orgs ever reach a reporter — the boundary is here in the
    // query, not in the client.
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (district) query = query.eq('district', district);
  // case_types is a text[]; .contains asks PostgREST for rows whose array
  // includes the given value (cs.{value}), i.e. orgs that handle this case type.
  if (caseType) query = query.contains('case_types', [caseType]);

  const { data, error } = await query;

  if (error) {
    // A DB failure is a server problem — surface it so the controller returns 500.
    throw new Error(`Organisation list failed: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch a single ACTIVE organisation by id.
 *
 * @param {string} id  the organisation uuid
 * @returns {Promise<object|null>} the public projection, or null if not found
 *   or inactive (an inactive org is treated as "does not exist" for reporters).
 * @throws on an unexpected database error (the controller maps it to a 500).
 */
async function getOrganisationById(id) {
  const trimmedId = (id || '').trim();
  if (!trimmedId) {
    return null;
  }

  const { data, error } = await supabase
    .from('organisations')
    .select(PUBLIC_ORG_COLUMNS)
    // is_active = true is part of the lookup so an inactive org returns null
    // (a generic 404) rather than being exposed to reporters.
    .eq('id', trimmedId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(`Organisation lookup failed: ${error.message}`);
  }

  return data || null;
}

/**
 * ADMIN: list ALL organisations, active AND inactive, name-ordered.
 *
 * Unlike the public listOrganisations (which filters is_active = true), this
 * returns every org plus its is_active flag so the admin console can badge and
 * reactivate inactive ones. Reached ONLY through requireRole('admin') routes.
 *
 * @returns {Promise<object[]>} the admin projection of every org.
 */
async function listAllOrganisations() {
  const { data, error } = await supabase
    .from('organisations')
    .select(ADMIN_ORG_COLUMNS)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Organisation admin list failed: ${error.message}`);
  }

  return data || [];
}

/**
 * ADMIN: create an organisation.
 *
 * @param {object} input  snake_case fields (name, district, case_types, ...)
 * @returns {Promise<object>} the created org in the admin projection.
 * @throws {ValidationError} on invalid input (mapped to 400 by the controller).
 */
async function createOrganisation(input) {
  const patch = buildOrgPatch(input, { isCreate: true });

  const { data, error } = await supabase
    .from('organisations')
    .insert(patch)
    .select(ADMIN_ORG_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Organisation create failed: ${error.message}`);
  }

  return data;
}

/**
 * ADMIN: update an organisation (partial; may include is_active).
 *
 * @param {string} id     the organisation uuid
 * @param {object} input  the snake_case fields to change
 * @returns {Promise<object>} the updated org in the admin projection.
 * @throws {ValidationError} on invalid input.
 * @throws {NotFoundError}   when the id matches no org.
 */
async function updateOrganisation(id, input) {
  const trimmedId = (id || '').trim();
  if (!trimmedId) {
    throw new NotFoundError('Organisation not found.');
  }

  const patch = buildOrgPatch(input, { isCreate: false });

  // A no-op update (empty patch) still needs a 404 check, so confirm existence
  // first rather than relying on the update touching a row.
  const { data, error } = await supabase
    .from('organisations')
    .update(patch)
    .eq('id', trimmedId)
    .select(ADMIN_ORG_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Organisation update failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError('Organisation not found.');
  }

  return data;
}

/**
 * ADMIN: SOFT-delete an organisation by clearing its is_active flag.
 *
 * WHY SOFT DELETE (never a DB DELETE): staff_users.organisation_id references
 * organisations(id) ON DELETE CASCADE (see docs/schema.sql), so a hard DELETE of
 * an org would silently CASCADE-delete every staff account in that org. A
 * deactivation instead just hides the org from the public directory and case
 * assignment (both filter is_active = true) while preserving its staff and its
 * history. NEVER replace this with supabase.delete().
 *
 * @param {string} id  the organisation uuid
 * @returns {Promise<object>} the deactivated org in the admin projection.
 * @throws {NotFoundError} when the id matches no org.
 */
async function deactivateOrganisation(id) {
  const trimmedId = (id || '').trim();
  if (!trimmedId) {
    throw new NotFoundError('Organisation not found.');
  }

  const { data, error } = await supabase
    .from('organisations')
    // Soft delete: flip the flag, never remove the row (would cascade to staff).
    .update({ is_active: false })
    .eq('id', trimmedId)
    .select(ADMIN_ORG_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Organisation deactivate failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError('Organisation not found.');
  }

  return data;
}

module.exports = {
  listOrganisations,
  getOrganisationById,
  listAllOrganisations,
  createOrganisation,
  updateOrganisation,
  deactivateOrganisation,
  ValidationError,
  NotFoundError,
  PUBLIC_ORG_COLUMNS,
  ADMIN_ORG_COLUMNS,
};
