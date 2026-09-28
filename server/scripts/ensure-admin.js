/**
 * JusticeNow — Ensure the permanent system admin exists.
 *
 * Idempotent: creates the system admin if missing, or resets it to a known-good
 * state (password, role, active, approved, no 2FA) if it already exists. Safe to
 * re-run any time the local admin login stops working.
 *
 * Run with `npm run ensure-admin` from server/.
 *
 * FOR LOCAL / PROJECT DEVELOPMENT ONLY. The credentials are intentionally simple
 * and printed to stdout so a developer can log in. Never use these on a real,
 * publicly-reachable deployment.
 *
 * PRIVACY: this touches STAFF only — never a reporter. Reporters have no account
 * by design.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

// The permanent system-admin credentials for this project.
const ADMIN = {
  name: 'System Admin',
  email: 'admin@gmail.com',
  password: 'Password123',
  role: 'admin',
};

async function ensureAdmin() {
  const passwordHash = await bcrypt.hash(ADMIN.password, 10);

  // The system-admin state: active + approved so it bypasses the onboarding /
  // approval gate, and mfa DISABLED so the login is a single step. The system
  // admin needs no organisation, so organisation_id stays null.
  const adminState = {
    name: ADMIN.name,
    email: ADMIN.email,
    password_hash: passwordHash,
    role: ADMIN.role,
    organisation_id: null,
    is_active: true,
    access_status: 'approved',
    profile_completed: true,
    mfa_enabled: false,
    mfa_method: 'totp',
    totp_secret: null,
    mfa_backup_codes: [],
  };

  // Look the account up by email so a re-run resets rather than duplicates.
  const { data: existing, error: findError } = await supabase
    .from('staff_users')
    .select('id')
    .eq('email', ADMIN.email)
    .maybeSingle();
  if (findError) {
    throw new Error(`Could not look up the admin: ${findError.message}`);
  }

  if (existing) {
    const { error: upErr } = await supabase
      .from('staff_users')
      .update(adminState)
      .eq('id', existing.id);
    if (upErr) {
      throw new Error(`Could not update the admin: ${upErr.message}`);
    }
    console.log(`\nUpdated existing system admin (id ${existing.id}).`);
  } else {
    const { data: created, error: insErr } = await supabase
      .from('staff_users')
      .insert(adminState)
      .select('id')
      .single();
    if (insErr) {
      throw new Error(`Could not create the admin: ${insErr.message}`);
    }
    console.log(`\nCreated system admin (id ${created.id}).`);
  }

  console.log('\n=== JusticeNow system admin ready (LOCAL / PROJECT ONLY) ===');
  console.log(`Email:    ${ADMIN.email}`);
  console.log(`Password: ${ADMIN.password}`);
  console.log('Role:     admin (bypasses onboarding/approval + 2FA gates)\n');
}

ensureAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
