/**
 * JusticeNow — Staff controller.
 *
 * Handles req/res for staff-only endpoints. Business logic (credential
 * verification, token minting) lives in services/auth.js — this layer only
 * orchestrates.
 *
 * PRIVACY: never log the email, password, or token. A failed login returns the
 * generic message the service provides, so it cannot be used to enumerate
 * which staff emails exist.
 */

const { authenticateStaff, authenticateGoogle, verifyGoogleEmail } = require('../services/auth');
const {
  signMfaToken,
  startEnrollment,
  activateMfa: activateMfaService,
  completeMfaLogin,
  resetMfa: resetMfaService,
  issueEmailOtp,
  resendEmailOtp,
} = require('../services/mfa');
const {
  listStaff: listStaffService,
  createStaff: createStaffService,
  updateStaff: updateStaffService,
  suspendStaff: suspendStaffService,
  unsuspendStaff: unsuspendStaffService,
  deleteStaff: deleteStaffService,
  registerStaff: registerStaffService,
  maybeSubmitForApproval,
  getStaffDetail: getStaffDetailService,
  setApprovalStatus: setApprovalStatusService,
} = require('../services/staffService');
const {
  getOwnProfile: getOwnProfileService,
  updateOwnProfile: updateOwnProfileService,
  updateOwnAvatar: updateOwnAvatarService,
  changeOwnPassword: changeOwnPasswordService,
} = require('../services/profileService');
const { writeAudit } = require('../services/audit');
const {
  requestReset: requestPasswordResetService,
  resetPassword: resetPasswordService,
} = require('../services/passwordResetService');

/**
 * POST /api/staff/login — authenticate a staff member.
 *
 * Body: { email, password }
 * Returns: { success: true, data: { token, staff } } on success,
 *          or the typed 401/500 { success: false, message } on failure.
 */
const login = async (req, res) => {
  // Rate-limit breach is surfaced by the middleware as a flag, not its own
  // response. Checked FIRST — before we validate the body, touch the service, or
  // run any bcrypt work — so a throttled caller cannot drive password-guessing
  // load. Unlike the anonymous status endpoint (which hides throttling behind a
  // generic 404 to avoid an enumeration oracle), login is a KNOWN public
  // endpoint, so an explicit 429 is the correct, honest signal to a client.
  if (req.isRateLimited) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please wait and try again.',
    });
  }

  const { email, password } = req.body || {};

  // Basic presence check — the service treats missing values as a failed
  // login anyway, but a 400 here is a clearer message for a malformed request.
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  try {
    const result = await authenticateStaff(email, password);

    // 2FA is on for this account: the password is correct but is NOT yet a
    // session. Hand back only a short-lived pending-MFA token; the client must
    // POST a code to /login/mfa to finish. No audit here — the login isn't
    // complete until the second factor passes.
    if (result.mfaRequired) {
      // For an email-method account we must SEND the code now, before responding,
      // so the staffer has it in their inbox by the time the code screen appears.
      // A send failure is a hard stop — without the email they cannot continue.
      if (result.mfaMethod === 'email') {
        try {
          await issueEmailOtp(result.staffId);
        } catch (mailErr) {
          const status = mailErr && mailErr.status ? mailErr.status : 500;
          const message =
            mailErr && mailErr.message
              ? mailErr.message
              : 'Could not send the code. Please try again.';
          return res.status(status).json({ success: false, message });
        }
      }
      // Tell the client which factor to prompt for (app code vs emailed code).
      return res.json({
        success: true,
        data: {
          mfa_required: true,
          mfa_method: result.mfaMethod,
          mfa_token: signMfaToken(result.staffId),
        },
      });
    }

    const { token, staff } = result;

    // Best-effort audit: record the login without any PII. writeAudit never
    // throws into this path, so we don't await it as a hard dependency.
    await writeAudit({ actorId: staff.id, action: 'staff_login' });

    return res.json({ success: true, data: { token, staff } });
  } catch (err) {
    // authenticateStaff throws a typed { status, message } for known failures.
    const status = err && err.status ? err.status : 500;
    const message =
      err && err.message
        ? err.message
        : 'Could not process the login. Please try again.';
    return res.status(status).json({ success: false, message });
  }
};

/**
 * POST /api/staff/google — authenticate a staff member via a Supabase Google
 * session. The client completes the Supabase Auth Google OAuth flow and sends
 * the resulting access token; we verify it and map the Google-verified email to
 * an active staff_users row, then issue our own JWT.
 *
 * Body: { access_token }
 * Returns: { success: true, data: { token, staff } } or a typed 401/403/500.
 */
const googleLogin = async (req, res) => {
  const { access_token: accessToken } = req.body || {};

  if (!accessToken) {
    return res.status(400).json({
      success: false,
      message: 'A Google session token is required.',
    });
  }

  try {
    const { token, staff } = await authenticateGoogle(accessToken);
    // Best-effort audit — same non-PII staff_login event as the password flow.
    await writeAudit({ actorId: staff.id, action: 'staff_login' });
    return res.json({ success: true, data: { token, staff } });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message =
      err && err.message ? err.message : 'Could not process the sign-in. Please try again.';
    return res.status(status).json({ success: false, message });
  }
};

// Generic, honest response for a successful self-registration. Same wording for
// password and Google signup so the client shows one consistent "pending" state.
const PENDING_APPROVAL_MESSAGE =
  'Account created. It is pending admin approval — you can sign in once an admin activates it.';

/**
 * POST /api/staff/register — PUBLIC self-service signup (email + password).
 *
 * Creates a PENDING (inactive) account: it cannot log in until an admin
 * activates it (login rejects is_active=false). Role is restricted to
 * officer/attorney/org_admin by the service. Rate-limited like /login to stop
 * automated account-spam. NEVER logs the email/password.
 *
 * Body: { name, email, password, role, organisation_id }
 */
const register = async (req, res) => {
  if (req.isRateLimited) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please wait and try again.',
    });
  }
  try {
    const staff = await registerStaffService(req.body || {});
    // Audit WHO/WHAT only — never the email or password.
    await writeAudit({
      action: 'staff_registered',
      detail: { staff_id: staff.id, role: staff.role },
    });
    return res.status(201).json({ success: true, message: PENDING_APPROVAL_MESSAGE });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message =
      err && err.message ? err.message : 'Could not create the account. Please try again.';
    return res.status(status).json({ success: false, message });
  }
};

/**
 * POST /api/staff/register/google — PUBLIC self-service signup via Google.
 *
 * The client completes the Supabase Google OAuth flow and sends the access token
 * plus the chosen role + organisation. We take the email from the GOOGLE-VERIFIED
 * identity (never from the body — a claimed email would be spoofable) and create
 * a PENDING (inactive) account with no password. Same approval gate as above.
 *
 * Body: { access_token, name, role, organisation_id }
 */
const registerGoogle = async (req, res) => {
  if (req.isRateLimited) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please wait and try again.',
    });
  }
  const {
    access_token: accessToken,
    name,
    role,
    organisation_id: organisationId,
    nic,
    phone,
    designation,
    bar_number: barNumber,
    department,
  } = req.body || {};
  try {
    // The email MUST come from Google's verified identity, not the request body.
    const email = await verifyGoogleEmail(accessToken);
    const staff = await registerStaffService(
      {
        name,
        email,
        role,
        organisation_id: organisationId,
        nic,
        phone,
        designation,
        bar_number: barNumber,
        department,
      },
      { google: true },
    );
    await writeAudit({
      action: 'staff_registered',
      detail: { staff_id: staff.id, role: staff.role },
    });
    return res.status(201).json({ success: true, message: PENDING_APPROVAL_MESSAGE });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message =
      err && err.message ? err.message : 'Could not create the account. Please try again.';
    return res.status(status).json({ success: false, message });
  }
};

/**
 * Map a service error to an HTTP response. A typed { status } (ValidationError
 * 400 / NotFoundError 404) is passed through; anything else is an unexpected
 * server error → 500 with a generic message. Never leaks stack traces or DB
 * text, and NEVER logs the password/hash/email (mirrors organisationsController).
 */
function respondServiceError(res, err, fallbackMessage) {
  if (err && typeof err.status === 'number') {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  console.error(fallbackMessage, err && err.message);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

/**
 * GET /api/staff — ADMIN list of ALL staff accounts (active + inactive).
 * Guarded by requireStaff + requireRole('admin') at the route. NEVER returns
 * password_hash (the service projection omits it).
 */
async function listStaff(req, res) {
  try {
    // Pass the caller so the service can SCOPE the list: a platform admin sees
    // every account; an org_admin sees ONLY their own org's staff.
    const data = await listStaffService(req.staff);
    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(res, err, 'Could not load staff. Please try again.');
  }
}

/**
 * POST /api/staff — ADMIN create a staff account.
 * AUDIT: staff_created with ONLY { staff_id, role } — never the email/password/
 * hash (privacy: the audit trail records WHO/WHAT, not credentials).
 */
async function createStaff(req, res) {
  try {
    // Pass the caller so the service can enforce org_admin scoping: force the
    // new account into the org_admin's own org and forbid creating a platform
    // admin. A platform admin is unrestricted.
    const staff = await createStaffService(req.body, req.staff);

    await writeAudit({
      actorId: req.staff.id,
      action: 'staff_created',
      detail: { staff_id: staff.id, role: staff.role },
    });

    return res.status(201).json({ success: true, data: staff });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not create the staff member. Please try again.',
    );
  }
}

/**
 * PUT /api/staff/:id — ADMIN update a staff account (partial; may rehash the
 * password and toggle is_active).
 * AUDIT: staff_updated with ONLY { staff_id, role } — never credentials.
 */
async function updateStaff(req, res) {
  try {
    // Pass the caller so the service can enforce org_admin scoping: an org_admin
    // may only update a staff row in their OWN org, and may not promote anyone
    // to platform admin nor move them to another org.
    const staff = await updateStaffService(req.params.id, req.body, req.staff);

    await writeAudit({
      actorId: req.staff.id,
      action: 'staff_updated',
      detail: { staff_id: staff.id, role: staff.role },
    });

    return res.json({ success: true, data: staff });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not update the staff member. Please try again.',
    );
  }
}

/**
 * POST /api/staff/:id/suspend — ADMIN suspend an account WITH a reason.
 * Reversible via /unsuspend. The service blocks login (is_active=false) and
 * records the reason; it refuses to suspend the caller's own account or the
 * last active admin. AUDIT: staff_suspended with ONLY { staff_id, role } —
 * NEVER the reason text (it may name a person; the trail records WHO/WHAT).
 */
async function suspendStaff(req, res) {
  try {
    const { reason } = req.body || {};
    const staff = await suspendStaffService(req.params.id, reason, req.staff);
    await writeAudit({
      actorId: req.staff.id,
      action: 'staff_suspended',
      detail: { staff_id: staff.id, role: staff.role },
    });
    return res.json({ success: true, data: staff });
  } catch (err) {
    return respondServiceError(res, err, 'Could not suspend the staff member. Please try again.');
  }
}

/**
 * POST /api/staff/:id/unsuspend — ADMIN lift a suspension (restore login access).
 * AUDIT: staff_unsuspended with ONLY { staff_id, role }.
 */
async function unsuspendStaff(req, res) {
  try {
    const staff = await unsuspendStaffService(req.params.id, req.staff);
    await writeAudit({
      actorId: req.staff.id,
      action: 'staff_unsuspended',
      detail: { staff_id: staff.id, role: staff.role },
    });
    return res.json({ success: true, data: staff });
  } catch (err) {
    return respondServiceError(res, err, 'Could not reactivate the staff member. Please try again.');
  }
}

/**
 * DELETE /api/staff/:id — ADMIN SOFT-delete a staff account WITH a reason.
 *
 * The service NEVER issues a DB DELETE — that would strip the actor from every
 * audit entry this person wrote (audit_log.actor_id ON DELETE SET NULL). It sets
 * deleted_at + the reason and flips is_active to false (login blocked, hidden
 * from the list), and refuses to delete the caller's own account or the last
 * active admin (both 400 from the service).
 * AUDIT: staff_deleted with ONLY { staff_id, role } — NEVER the reason text.
 */
async function deleteStaff(req, res) {
  try {
    // DELETE bodies are unusual but supported; the reason is required by the service.
    const { reason } = req.body || {};
    const staff = await deleteStaffService(req.params.id, reason, req.staff);

    await writeAudit({
      actorId: req.staff.id,
      action: 'staff_deleted',
      detail: { staff_id: staff.id, role: staff.role },
    });

    return res.json({ success: true, data: staff });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not delete the staff member. Please try again.',
    );
  }
}

// --- Self-service profile (U-profile). ALL operate on req.staff.id ONLY: a
// staffer edits only their OWN record. Email/role/organisation are read-only
// here; admin management of other accounts lives above. ---

/**
 * GET /api/staff/me — the caller's own profile. NEVER returns password_hash.
 * auth_method comes from the session (req.staff.method).
 */
async function getMe(req, res) {
  try {
    const data = await getOwnProfileService(req.staff.id, req.staff.method);
    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(res, err, 'Could not load your profile. Please try again.');
  }
}

/**
 * PATCH /api/staff/me — update the caller's editable fields (name, nic, phone,
 * designation, bar_number). The service validates every field, DERIVES gender +
 * date_of_birth from the NIC, and recomputes profile_completed.
 */
async function updateMe(req, res) {
  try {
    const data = await updateOwnProfileService({
      staffId: req.staff.id,
      role: req.staff.role,
      authMethod: req.staff.method,
      input: req.body,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(res, err, 'Could not update your profile. Please try again.');
  }
}

/**
 * POST /api/staff/me/avatar — upload the caller's avatar (multipart `avatar`).
 * The original filename is discarded (privacy); a random storage key is used.
 * AUDIT: a minimal staff_updated with only { staff_id } — no PII.
 */
async function updateMyAvatar(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Choose an image to upload.' });
    }
    const data = await updateOwnAvatarService({
      staffId: req.staff.id,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    // Best-effort audit — WHO/WHAT only, never the filename or bytes.
    await writeAudit({
      actorId: req.staff.id,
      action: 'staff_updated',
      detail: { staff_id: req.staff.id },
    });

    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(res, err, 'Could not update your avatar. Please try again.');
  }
}

/**
 * POST /api/staff/me/password — change the caller's own password. Refused for
 * Google sessions (no password_hash to verify). Never logs the password.
 * AUDIT: a minimal staff_updated with only { staff_id } — never the password.
 */
async function changeMyPassword(req, res) {
  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body || {};
    await changeOwnPasswordService({
      staffId: req.staff.id,
      authMethod: req.staff.method,
      currentPassword,
      newPassword,
    });

    await writeAudit({
      actorId: req.staff.id,
      action: 'staff_updated',
      detail: { staff_id: req.staff.id },
    });

    return res.json({ success: true, message: 'Your password has been changed.' });
  } catch (err) {
    return respondServiceError(res, err, 'Could not change your password. Please try again.');
  }
}

/**
 * POST /api/staff/login/mfa — second login step. PUBLIC (the caller holds only
 * a pending-MFA token, not a session yet).
 * Body: { mfa_token, code }  → { success, data: { token, staff } } | typed 401.
 */
const loginMfa = async (req, res) => {
  if (req.isRateLimited) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please wait and try again.',
    });
  }
  const { mfa_token: mfaToken, code } = req.body || {};
  if (!mfaToken || !code) {
    return res.status(400).json({ success: false, message: 'A code is required.' });
  }
  try {
    const { token, staff } = await completeMfaLogin(mfaToken, code);
    await writeAudit({ actorId: staff.id, action: 'staff_login' });
    return res.json({ success: true, data: { token, staff } });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = err && err.message ? err.message : 'Could not process the login.';
    return res.status(status).json({ success: false, message });
  }
};

/**
 * POST /api/staff/me/mfa/setup — begin 2FA enrollment for the CALLER. Guarded by
 * requireStaff.
 *
 * Body: { method?: 'totp' | 'email' }  (defaults to 'totp')
 *  - 'totp'  → returns { method, qr, otpauth_url } to add to an authenticator app.
 *  - 'email' → emails a code and returns { method } (nothing to scan).
 */
const setupMfa = async (req, res) => {
  // Anything other than an explicit 'email' falls back to the authenticator app.
  const method = req.body && req.body.method === 'email' ? 'email' : 'totp';
  try {
    const result = await startEnrollment(req.staff.id, req.staff.email, method);
    return res.json({
      success: true,
      data: {
        method: result.method,
        qr: result.qrDataUrl || null,
        otpauth_url: result.otpauthUrl || null,
      },
    });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    return res.status(status).json({ success: false, message: err.message || 'Could not start 2FA setup.' });
  }
};

/**
 * POST /api/staff/login/mfa/resend — re-send an email 2FA code mid-login. PUBLIC
 * (the caller holds only the short-lived pending-MFA token). Rate-limited like
 * the other login steps so it cannot be used to spam a staffer's inbox.
 * Body: { mfa_token }
 */
const resendMfa = async (req, res) => {
  if (req.isRateLimited) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please wait and try again.',
    });
  }
  const { mfa_token: mfaToken } = req.body || {};
  if (!mfaToken) {
    return res.status(400).json({ success: false, message: 'Your login session expired. Please sign in again.' });
  }
  try {
    await resendEmailOtp(mfaToken);
    return res.json({ success: true });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    return res.status(status).json({ success: false, message: err.message || 'Could not send the code.' });
  }
};

/**
 * POST /api/staff/me/mfa/activate — finish enrollment by verifying a live code.
 * Guarded by requireStaff. Returns the one-time backup codes.
 * Body: { code }
 */
const activateMfa = async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ success: false, message: 'A code is required.' });
  }
  try {
    const { backupCodes } = await activateMfaService(req.staff.id, code);
    // If the profile is already complete, enabling 2FA is the last step → auto-submit
    // the account for admin approval (onboarding → pending).
    const accessStatus = await maybeSubmitForApproval(req.staff.id);
    return res.json({ success: true, data: { backup_codes: backupCodes, access_status: accessStatus } });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    return res.status(status).json({ success: false, message: err.message || 'Could not enable 2FA.' });
  }
};

/**
 * POST /api/staff/:id/mfa/reset — ADMIN resets a colleague's 2FA (lost device).
 * Guarded by requireStaff + requireRole('admin', 'org_admin') at the route. The
 * target must re-enroll on next login.
 */
const resetMfa = async (req, res) => {
  try {
    await resetMfaService(req.params.id);
    await writeAudit({ actorId: req.staff.id, action: 'staff_updated' });
    return res.json({ success: true });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    return res.status(status).json({ success: false, message: err.message || 'Could not reset 2FA.' });
  }
};

/**
 * POST /api/staff/password/forgot — PUBLIC, rate-limited. Body: { email }.
 * Always returns the SAME generic success (no oracle): only a genuine active
 * password account is actually emailed a reset code (see passwordResetService).
 */
async function forgotPassword(req, res) {
  if (req.isRateLimited) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a moment and try again.',
    });
  }
  const { email } = req.body || {};
  try {
    await requestPasswordResetService(email);
  } catch {
    // Never surface internal failures — that would be an oracle. Fall through to
    // the identical generic response below.
  }
  // Identical response whether or not the email maps to an account.
  return res.json({
    success: true,
    message: 'If an account exists for that email, a reset code has been sent.',
  });
}

/**
 * POST /api/staff/password/reset — PUBLIC, rate-limited.
 * Body: { email, code, new_password }. Verifies the emailed code and sets the new
 * password. Generic failure for a wrong email OR wrong/expired code (no oracle).
 */
async function resetPassword(req, res) {
  if (req.isRateLimited) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please wait and try again.',
    });
  }
  const { email, code, new_password: newPassword } = req.body || {};
  try {
    await resetPasswordService(email, code, newPassword);
    return res.json({ success: true, message: 'Your password has been reset. Please sign in.' });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message =
      err && err.message ? err.message : 'Could not reset your password. Please try again.';
    return res.status(status).json({ success: false, message });
  }
}

/**
 * GET /api/staff/:id — ADMIN detail view for approval (submitted profile + 2FA
 * status). Guarded by requireRole('admin','org_admin') on the route.
 */
async function getStaffDetail(req, res) {
  try {
    const data = await getStaffDetailService(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(res, err, 'Could not load the staff account.');
  }
}

/** POST /api/staff/:id/approve — ADMIN grants case access (onboarding/pending → approved). */
async function approveStaff(req, res) {
  try {
    const data = await setApprovalStatusService(req.params.id, 'approved');
    await writeAudit({ actorId: req.staff.id, action: 'staff_updated', detail: { staff_id: req.params.id, approval: 'approved' } });
    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(res, err, 'Could not approve the account.');
  }
}

/** POST /api/staff/:id/reject — ADMIN denies access (→ rejected, cannot log in). */
async function rejectStaff(req, res) {
  try {
    const data = await setApprovalStatusService(req.params.id, 'rejected');
    await writeAudit({ actorId: req.staff.id, action: 'staff_updated', detail: { staff_id: req.params.id, approval: 'rejected' } });
    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(res, err, 'Could not reject the account.');
  }
}

module.exports = {
  login,
  loginMfa,
  resendMfa,
  forgotPassword,
  resetPassword,
  getStaffDetail,
  approveStaff,
  rejectStaff,
  googleLogin,
  register,
  registerGoogle,
  listStaff,
  createStaff,
  updateStaff,
  suspendStaff,
  unsuspendStaff,
  deleteStaff,
  getMe,
  updateMe,
  updateMyAvatar,
  changeMyPassword,
  setupMfa,
  activateMfa,
  resetMfa,
};
