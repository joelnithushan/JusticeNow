/**
 * JusticeNow — Single Server-Side Supabase Client
 *
 * Uses the service_role key to bypass Row-Level Security (RLS) for all backend
 * database and storage operations. Reporters and external clients never receive
 * this key; it runs server-side only.
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Ensure .env in the backend folder is loaded
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// Fail fast at startup if credentials are missing
if (!supabaseUrl || !supabaseServiceRoleKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  const errorMsg = `[FATAL] Missing required Supabase credentials: ${missing.join(', ')} must be set in server/.env`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}

// Log only the first 10 characters so the user can verify it starts with "sb_secret_"
// NEVER log the full key (anonymity and security rule).
const keyPrefix = supabaseServiceRoleKey.slice(0, 10);
if (process.env.NODE_ENV !== 'test') {
  console.log(`[Supabase] Initializing server-side client with URL: ${supabaseUrl}`);
  console.log(`[Supabase] Service role key prefix: ${keyPrefix}...`);
}

// Create and export single server-side Supabase client instance
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

module.exports = supabase;
