const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase credentials: SUPABASE_URL and SUPABASE_KEY must be set in server/.env.\n' +
    'Copy server/.env.example to server/.env and fill in the values from your ' +
    'Supabase Dashboard -> Project Settings -> API.'
  );
}

// Create and export Supabase client instance
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Server-side usage: no browser session persistence needed
    persistSession: false
  }
});

module.exports = supabase;
