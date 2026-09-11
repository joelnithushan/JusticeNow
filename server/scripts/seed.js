/**
 * JusticeNow — Local seed script.
 *
 * Creates one organisation and one admin staff user so the staff dashboard can
 * be exercised locally. Run with `npm run seed` from server/.
 *
 * FOR LOCAL DEVELOPMENT ONLY. The credentials below are obviously fake and are
 * printed to stdout on purpose so a developer can log in. Never run this
 * against a production database, and never commit real credentials.
 *
 * PRIVACY: this seeds STAFF only — never a reporter. Reporters have no account
 * by design.
 */

const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

// Obviously-fake local credentials. .local TLD makes clear this is not real.
const SEED_ORG = {
  name: 'JusticeNow Dev Legal Aid',
  description: 'Seed organisation for local development.',
  district: 'Colombo',
  case_types: ['harassment', 'unlawful_detention', 'land_dispute'],
  contact_email: 'contact@justicenow.local',
};

const SEED_ADMIN = {
  name: 'Dev Admin',
  email: 'admin@justicenow.local',
  // Local-only password. Change it before any shared/hosted use.
  password: 'ChangeMe!Dev-2026',
  role: 'admin',
};

async function seed() {
  // bcryptjs default cost of 10 is fine for a local seed.
  const passwordHash = await bcrypt.hash(SEED_ADMIN.password, 10);

  // Upsert-ish: create the org, then the admin pointing at it.
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .insert(SEED_ORG)
    .select('id')
    .single();

  if (orgError) {
    throw new Error(`Failed to seed organisation: ${orgError.message}`);
  }

  const { error: staffError } = await supabase.from('staff_users').insert({
    organisation_id: org.id,
    name: SEED_ADMIN.name,
    email: SEED_ADMIN.email,
    password_hash: passwordHash,
    role: SEED_ADMIN.role,
  });

  if (staffError) {
    throw new Error(`Failed to seed admin staff user: ${staffError.message}`);
  }

  // Print the login so the developer can use it. Local dev only.
  console.log('\n=== JusticeNow seed complete (LOCAL DEV ONLY) ===');
  console.log('WARNING: these are fake local credentials. Do NOT use in production.');
  console.log(`Organisation: ${SEED_ORG.name} (${org.id})`);
  console.log(`Admin login email:    ${SEED_ADMIN.email}`);
  console.log(`Admin login password: ${SEED_ADMIN.password}`);
  console.log('================================================\n');
}

// Only run when invoked directly (npm run seed / node scripts/seed.js), so
// importing this module for testing does not touch the database.
if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
}

module.exports = { seed, SEED_ADMIN, SEED_ORG };
