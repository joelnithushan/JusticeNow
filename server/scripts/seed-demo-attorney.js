/**
 * JusticeNow — Seed a demo ATTORNEY connected to a real organisation.
 *
 * Idempotent: creates the demo attorney if missing, or resets it to a
 * known-good state (password, role, org link, active, approved, no 2FA) on
 * re-run. Mirrors ensure-admin.js.
 *
 * FOR LOCAL / DEMO ONLY — simple credentials, printed to stdout. Never use on a
 * real public deployment.
 *
 * PRIVACY: touches STAFF only, never a reporter.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

// Connect the attorney to the Legal Aid Commission of Sri Lanka (an existing org).
const ORG_NAME = 'Legal Aid Commission of Sri Lanka';
const ATTORNEY = {
  name: 'Demo Attorney',
  email: 'attorney@gmail.com',
  password: 'Password123',
  role: 'attorney',
};

async function run() {
  // Resolve the organisation by name so we link to the real row, not a guess.
  const { data: org, error: orgErr } = await supabase
    .from('organisations')
    .select('id, name')
    .eq('name', ORG_NAME)
    .maybeSingle();
  if (orgErr) throw new Error(`Could not look up organisation: ${orgErr.message}`);
  if (!org) throw new Error(`Organisation not found: ${ORG_NAME}`);

  const passwordHash = await bcrypt.hash(ATTORNEY.password, 10);
  const state = {
    name: ATTORNEY.name,
    email: ATTORNEY.email,
    password_hash: passwordHash,
    role: ATTORNEY.role,
    organisation_id: org.id,
    is_active: true,
    access_status: 'approved',
    profile_completed: true,
    mfa_enabled: false,
    mfa_method: 'totp',
    totp_secret: null,
    mfa_backup_codes: [],
  };

  const { data: existing, error: findErr } = await supabase
    .from('staff_users')
    .select('id')
    .eq('email', ATTORNEY.email)
    .maybeSingle();
  if (findErr) throw new Error(`Could not look up the attorney: ${findErr.message}`);

  if (existing) {
    const { error } = await supabase.from('staff_users').update(state).eq('id', existing.id);
    if (error) throw new Error(`Could not update the attorney: ${error.message}`);
    console.log(`\nUpdated existing demo attorney (id ${existing.id}).`);
  } else {
    const { data: created, error } = await supabase
      .from('staff_users')
      .insert(state)
      .select('id')
      .single();
    if (error) throw new Error(`Could not create the attorney: ${error.message}`);
    console.log(`\nCreated demo attorney (id ${created.id}).`);
  }

  console.log('\n=== JusticeNow demo attorney ready (LOCAL / DEMO ONLY) ===');
  console.log(`Email:        ${ATTORNEY.email}`);
  console.log(`Password:     ${ATTORNEY.password}`);
  console.log(`Role:         ${ATTORNEY.role}`);
  console.log(`Organisation: ${org.name} (${org.id})`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
