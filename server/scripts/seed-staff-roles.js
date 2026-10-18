/**
 * JusticeNow — Seed Staff Roles (Legal Aid Attorney & NGO Advocacy Officer)
 *
 * Creates or resets demo accounts for:
 * 1. Legal Aid Attorney (role: 'attorney')
 * 2. NGO Advocacy Officer (role: 'officer')
 *
 * Both accounts are set to:
 * - is_active: true
 * - access_status: 'approved'
 * - profile_completed: true
 * - mfa_enabled: false (direct login without 2FA challenge)
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

const DEMO_ORGS = [
  {
    name: 'Legal Aid Commission of Sri Lanka',
    description: 'Statutory body providing free legal counsel and representation to human rights victims.',
    district: 'Colombo',
    case_types: ['harassment', 'unlawful_detention', 'land_dispute', 'discrimination', 'official_misconduct'],
    contact_phone: '+94112433618',
    contact_email: 'legalaid@lac.gov.lk',
    is_active: true,
  },
  {
    name: 'Centre for Human Rights & Development (CHRD)',
    description: 'Human rights organization dedicated to monitoring, advocacy, and victim protection.',
    district: 'Colombo',
    case_types: ['harassment', 'unlawful_detention', 'violence', 'abuse_of_authority', 'discrimination'],
    contact_phone: '+94112674488',
    contact_email: 'info@chrd.org',
    is_active: true,
  },
];

const DEMO_USERS = [
  {
    name: 'Nimal Perera',
    email: 'attorney@justicenow.org',
    password: 'Password123',
    role: 'attorney',
    orgName: 'Legal Aid Commission of Sri Lanka',
    nic: '198823401234',
    phone: '+94771234567',
    designation: 'Senior Legal Aid Attorney',
    bar_number: 'BASL-8492',
    department: null,
  },
  {
    name: 'Fathima Rameez',
    email: 'officer@justicenow.org',
    password: 'Password123',
    role: 'officer',
    orgName: 'Centre for Human Rights & Development (CHRD)',
    nic: '199267802345',
    phone: '+94779876543',
    designation: 'Human Rights Advocacy Officer',
    bar_number: null,
    department: 'Investigation & Advocacy',
  },
];

async function ensureOrg(orgDef) {
  const { data: existing, error: findError } = await supabase
    .from('organisations')
    .select('id')
    .eq('name', orgDef.name)
    .maybeSingle();

  if (findError) {
    throw new Error(`Failed to check organisation ${orgDef.name}: ${findError.message}`);
  }

  if (existing) {
    return existing.id;
  }

  const { data: created, error: insertError } = await supabase
    .from('organisations')
    .insert(orgDef)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to insert organisation ${orgDef.name}: ${insertError.message}`);
  }

  return created.id;
}

async function ensureStaff() {
  console.log('\n=== Seeding Demo Staff Accounts ===\n');

  // 1. Ensure Orgs
  const orgMap = {};
  for (const orgDef of DEMO_ORGS) {
    const orgId = await ensureOrg(orgDef);
    orgMap[orgDef.name] = orgId;
    console.log(`[Org] ${orgDef.name} (ID: ${orgId}) ready.`);
  }

  // 2. Ensure Users
  for (const user of DEMO_USERS) {
    const orgId = orgMap[user.orgName];
    const passwordHash = await bcrypt.hash(user.password, 10);

    const staffPayload = {
      name: user.name,
      email: user.email.toLowerCase().trim(),
      password_hash: passwordHash,
      role: user.role,
      organisation_id: orgId,
      nic: user.nic,
      phone: user.phone,
      designation: user.designation,
      bar_number: user.bar_number,
      department: user.department,
      access_status: 'approved',
      is_active: true,
      profile_completed: true,
      mfa_enabled: false,
      mfa_method: 'totp',
      totp_secret: null,
      mfa_backup_codes: [],
    };

    const { data: existing, error: findError } = await supabase
      .from('staff_users')
      .select('id')
      .eq('email', staffPayload.email)
      .maybeSingle();

    if (findError) {
      throw new Error(`Failed to lookup ${user.email}: ${findError.message}`);
    }

    if (existing) {
      const { error: upErr } = await supabase
        .from('staff_users')
        .update(staffPayload)
        .eq('id', existing.id);

      if (upErr) {
        throw new Error(`Failed to update ${user.email}: ${upErr.message}`);
      }
      console.log(`[User] Updated ${user.role}: ${user.email} (id: ${existing.id})`);
    } else {
      const { data: created, error: insErr } = await supabase
        .from('staff_users')
        .insert(staffPayload)
        .select('id')
        .single();

      if (insErr) {
        throw new Error(`Failed to create ${user.email}: ${insErr.message}`);
      }
      console.log(`[User] Created ${user.role}: ${user.email} (id: ${created.id})`);
    }
  }

  console.log('\n=== Staff Credentials Successfully Created ===\n');
  for (const user of DEMO_USERS) {
    console.log(`Role:         ${user.role.toUpperCase()}`);
    console.log(`Name:         ${user.name}`);
    console.log(`Email:        ${user.email}`);
    console.log(`Password:     ${user.password}`);
    console.log(`Organisation: ${user.orgName}`);
    console.log('--------------------------------------------------');
  }
}

ensureStaff()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
