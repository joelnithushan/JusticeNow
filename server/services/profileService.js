/**
 * JusticeNow — Self-service staff profile service.
 *
 * Owns all Supabase access for a staffer editing their OWN record. Every
 * function here operates on the caller's id ONLY — there is no id argument a
 * caller could point at someone else's row. Admin management of other accounts
 * lives in staffService.js; this is the "edit my own profile" surface.
 *
 * SECURITY / PRIVACY:
 *  - NEVER returns password_hash (the safe projection omits it).
 *  - gender + date_of_birth are DERIVED server-side from the NIC via decodeNic()
 *    — we never trust a client-sent gender/dob, because they are the one piece a
 *    NIC proves and a client could otherwise lie about.
 *  - The avatar's original filename is DISCARDED (privacy — like evidence): a
 *    filename can identify a person ("id_scan_kumar.jpg"), so we store under a
 *    random key only.
 *  - Passwords are bcrypt-hashed here; the plaintext is never stored or logged.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { decodeNic, isValidLkMobile } = require('../utils/nic');

// Public storage bucket for staff avatars. Unlike evidence (private, signed
// URLs only), an avatar is a non-sensitive display picture the staffer chooses,
// so the bucket is public and we return a stable public URL.
const AVATAR_BUCKET = 'avatars';

// bcrypt work factor — matches staffService.BCRYPT_COST / the seed script.
const BCRYPT_COST = 10;

// Minimum password length, enforced server-side (the authority). Mirrors
// staffService.MIN_PASSWORD_LENGTH.
const MIN_PASSWORD_LENGTH = 8;

// The largest avatar we accept, in bytes (~5MB). Enforced at the multer layer
// too, but re-checked here so the service is safe on its own.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// The columns a staffer may receive for their OWN profile. password_hash is
// deliberately ABSENT — it must never leave the server.
const PROFILE_COLUMNS =
  'id, name, email, role, organisation_id, nic, phone, designation, ' +
  'bar_number, gender, date_of_birth, avatar_path, profile_completed';

/** A validation error the controller maps to a 400 (mirrors staffService). */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/** A not-found error the controller maps to a 404 (mirrors staffService). */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

/**
 * Turn a stored avatar_path into a public URL, or null when there is no avatar.
 * The `avatars` bucket is public, so a stable getPublicUrl is fine here (an
 * avatar is not sensitive — contrast evidence, which uses short-lived signed
 * URLs).
 *
 * @param {?string} avatarPath
 * @returns {?string}
 */
function avatarUrlFor(avatarPath) {
  if (!avatarPath) {
    return null;
  }
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath);
  return (data && data.publicUrl) || null;
}

/**
 * Shape a raw staff_users row into the client-facing profile object. Explicitly
 * lists the returned fields (never spreads the row) so password_hash and any
 * future sensitive column can never leak by accident. Resolves the org name and
 * the avatar's public URL.
 *
 * @param {object}  row         the staff_users row (PROFILE_COLUMNS projection)
 * @param {?string} orgName     the organisation's display name, or null
 * @param {string}  authMethod  req.staff.method ('password' | 'google')
 * @returns {object} the profile in the documented snake_case shape
 */
function toProfile(row, orgName, authMethod) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    organisation_id: row.organisation_id,
    organisation_name: orgName || null,
    nic: row.nic || null,
    phone: row.phone || null,
    designation: row.designation || null,
    bar_number: row.bar_number || null,
    gender: row.gender || null,
    date_of_birth: row.date_of_birth || null,
    avatar_url: avatarUrlFor(row.avatar_path),
    profile_completed: Boolean(row.profile_completed),
    // Whether this session may change a password (password accounts only). The
    // client uses it to show/hide the change-password form; the server re-checks.
    auth_method: authMethod,
  };
}

/**
 * Load the caller's own staff_users row (or throw NotFoundError) plus its org
 * name. Shared by GET /me and the write paths (which re-read to return the
 * updated profile).
 *
 * @param {string} staffId  the caller's id (req.staff.id)
 * @returns {Promise<{ row: object, orgName: ?string }>}
 * @throws {NotFoundError} when the id matches no staff row
 */
async function loadOwnRow(staffId) {
  const trimmedId = (staffId || '').trim();
  if (!trimmedId) {
    throw new NotFoundError('Your profile could not be found.');
  }

  const { data: row, error } = await supabase
    .from('staff_users')
    .select(PROFILE_COLUMNS)
    .eq('id', trimmedId)
    .maybeSingle();

  if (error) {
    throw new Error(`Profile lookup failed: ${error.message}`);
  }
  if (!row) {
    throw new NotFoundError('Your profile could not be found.');
  }

  let orgName = null;
  if (row.organisation_id) {
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', row.organisation_id)
      .maybeSingle();
    if (orgError) {
      throw new Error(`Profile org lookup failed: ${orgError.message}`);
    }
    orgName = org ? org.name : null;
  }

  return { row, orgName };
}

/**
 * GET the caller's own profile.
 *
 * @param {string} staffId     req.staff.id
 * @param {string} authMethod  req.staff.method
 * @returns {Promise<object>} the profile shape
 * @throws {NotFoundError}
 */
async function getOwnProfile(staffId, authMethod) {
  const { row, orgName } = await loadOwnRow(staffId);
  return toProfile(row, orgName, authMethod);
}

/**
 * PATCH the caller's own editable fields. Email/role/organisation are READ-ONLY
 * here (admins control those). Validates every field server-side (the authority)
 * and DERIVES gender + date_of_birth from the NIC decode — never from the client.
 *
 * @param {object} params
 * @param {string} params.staffId     req.staff.id
 * @param {string} params.role        req.staff.role (decides if bar_number is required)
 * @param {string} params.authMethod  req.staff.method (for the returned shape)
 * @param {object} params.input       raw snake_case body (name, nic, phone,
 *                                     designation, bar_number)
 * @returns {Promise<object>} the updated profile shape
 * @throws {ValidationError} on any invalid field
 * @throws {NotFoundError}   when the caller's row is missing
 */
async function updateOwnProfile({ staffId, role, authMethod, input }) {
  const src = input || {};
  const patch = {};

  // name — required non-empty when supplied; a profile must always keep a name.
  if (src.name !== undefined) {
    const name = typeof src.name === 'string' ? src.name.trim() : '';
    if (!name) {
      throw new ValidationError('Enter your name.');
    }
    patch.name = name;
  }

  // nic — decode + validate. On success DERIVE gender + date_of_birth from the
  // decode (the NIC is the authority on both); we never trust a client-sent
  // gender/dob. A single clear message covers every invalid form (bad format,
  // impossible day, Feb-29 in a non-leap year) so we do not leak the check logic.
  if (src.nic !== undefined) {
    const nic = typeof src.nic === 'string' ? src.nic.trim() : '';
    const decoded = decodeNic(nic);
    if (!decoded.valid) {
      throw new ValidationError('Enter a valid Sri Lankan NIC.');
    }
    patch.nic = nic.toUpperCase();
    patch.gender = decoded.gender;
    patch.date_of_birth = decoded.dateOfBirth;
  }

  // phone — Sri Lankan mobile only (local or international form).
  if (src.phone !== undefined) {
    const phone = typeof src.phone === 'string' ? src.phone.trim() : '';
    if (!isValidLkMobile(phone)) {
      throw new ValidationError('Enter a valid Sri Lankan mobile number.');
    }
    patch.phone = phone;
  }

  // designation — free text; trim, allow clearing to null.
  if (src.designation !== undefined) {
    const designation =
      typeof src.designation === 'string' ? src.designation.trim() : '';
    patch.designation = designation || null;
  }

  // bar_number — only meaningful for attorneys. For any other role the field is
  // IGNORED (not an error), so an officer sending it by mistake is harmless.
  if (role === 'attorney' && src.bar_number !== undefined) {
    const barNumber =
      typeof src.bar_number === 'string' ? src.bar_number.trim() : '';
    if (!barNumber) {
      throw new ValidationError('Enter your bar number.');
    }
    patch.bar_number = barNumber;
  }

  // Load the current row so we can recompute profile_completed against the
  // MERGE of existing values + this patch (a partial PATCH must not clobber
  // completeness computed from fields it did not touch).
  const { row: current, orgName } = await loadOwnRow(staffId);

  const merged = {
    name: patch.name !== undefined ? patch.name : current.name,
    nic: patch.nic !== undefined ? patch.nic : current.nic,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
    designation:
      patch.designation !== undefined ? patch.designation : current.designation,
    bar_number:
      patch.bar_number !== undefined ? patch.bar_number : current.bar_number,
  };

  // profile_completed: the core four fields, plus a bar_number ONLY for
  // attorneys. Recomputed and stored on every PATCH so the flag cannot drift.
  patch.profile_completed = Boolean(
    merged.name &&
      merged.nic &&
      merged.phone &&
      merged.designation &&
      (role !== 'attorney' || merged.bar_number),
  );

  const { data: updated, error } = await supabase
    .from('staff_users')
    .update(patch)
    // Scope the write to the caller's OWN id — a staffer edits only their record.
    .eq('id', (staffId || '').trim())
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Profile update failed: ${error.message}`);
  }
  if (!updated) {
    throw new NotFoundError('Your profile could not be found.');
  }

  return toProfile(updated, orgName, authMethod);
}

/**
 * Upload a new avatar for the caller and store its path. The original filename
 * is DISCARDED (privacy — a filename can identify a person); we store under a
 * random key with the incoming content-type's extension.
 *
 * @param {object} params
 * @param {string} params.staffId   req.staff.id
 * @param {Buffer} params.buffer    the image bytes (multer memoryStorage)
 * @param {string} params.mimetype  the image content-type (must be image/*)
 * @param {number} params.size      byte length (re-checked against the cap)
 * @returns {Promise<{ avatar_url: string }>}
 * @throws {ValidationError} on a missing/oversized/non-image file
 * @throws {NotFoundError}   when the caller's row is missing
 */
async function updateOwnAvatar({ staffId, buffer, mimetype, size }) {
  if (!buffer || !size) {
    throw new ValidationError('Choose an image to upload.');
  }
  // Accept images only — reject anything else before it touches storage.
  if (!mimetype || !mimetype.startsWith('image/')) {
    throw new ValidationError('The avatar must be an image file.');
  }
  if (size > MAX_AVATAR_BYTES) {
    throw new ValidationError('The avatar must be 5MB or smaller.');
  }

  // Confirm the caller's row exists first, so a bogus session is a clean 404
  // rather than an orphaned upload.
  await loadOwnRow(staffId);

  // Random key — never the original filename. A short random hex is enough here
  // (avatars are public, non-sensitive); the extension aids content-type serving.
  const ext = mimetype === 'image/png' ? '.png' : mimetype === 'image/webp' ? '.webp' : '.jpg';
  const key = `${crypto.randomBytes(16).toString('hex')}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(key, buffer, { contentType: mimetype, upsert: true });

  if (uploadError) {
    throw new Error(`Avatar upload failed: ${uploadError.message}`);
  }

  const { data: updated, error } = await supabase
    .from('staff_users')
    .update({ avatar_path: key })
    .eq('id', (staffId || '').trim())
    .select('avatar_path')
    .maybeSingle();

  if (error) {
    throw new Error(`Avatar path update failed: ${error.message}`);
  }
  if (!updated) {
    throw new NotFoundError('Your profile could not be found.');
  }

  return { avatar_url: avatarUrlFor(updated.avatar_path) };
}

/**
 * Change the caller's OWN password.
 *
 * ONLY password accounts may do this: a Google-authenticated session has no
 * password_hash to verify against, so we refuse it (the client offers the flow
 * only for password accounts; the server is the real boundary).
 *
 * @param {object} params
 * @param {string} params.staffId          req.staff.id
 * @param {string} params.authMethod       req.staff.method
 * @param {string} params.currentPassword  the caller's current password
 * @param {string} params.newPassword      the desired new password
 * @returns {Promise<void>}
 * @throws {ValidationError} google account / missing fields / wrong current /
 *                           too-short new password (all 400)
 * @throws {NotFoundError}   when the caller's row is missing
 */
async function changeOwnPassword({ staffId, authMethod, currentPassword, newPassword }) {
  // Google sessions have no password to change. Refuse BEFORE reading anything.
  if (authMethod === 'google') {
    throw new ValidationError(
      'Password change is not available for Google sign-in accounts.',
    );
  }

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Both the current and new password are required.');
  }
  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const trimmedId = (staffId || '').trim();
  // Read the hash to verify the current password. This is the ONE place that
  // touches password_hash on the self-service surface — it is never returned.
  const { data: row, error } = await supabase
    .from('staff_users')
    .select('id, password_hash')
    .eq('id', trimmedId)
    .maybeSingle();

  if (error) {
    throw new Error(`Password lookup failed: ${error.message}`);
  }
  if (!row) {
    throw new NotFoundError('Your profile could not be found.');
  }

  const currentMatches = await bcrypt.compare(
    String(currentPassword),
    row.password_hash || '',
  );
  if (!currentMatches) {
    throw new ValidationError('Your current password is incorrect.');
  }

  const newHash = await bcrypt.hash(String(newPassword), BCRYPT_COST);

  const { error: updateError } = await supabase
    .from('staff_users')
    .update({ password_hash: newHash })
    .eq('id', trimmedId);

  if (updateError) {
    throw new Error(`Password update failed: ${updateError.message}`);
  }
}

module.exports = {
  getOwnProfile,
  updateOwnProfile,
  updateOwnAvatar,
  changeOwnPassword,
  ValidationError,
  NotFoundError,
  PROFILE_COLUMNS,
  MIN_PASSWORD_LENGTH,
  MAX_AVATAR_BYTES,
  AVATAR_BUCKET,
};
