const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
  console.warn(
    '⚠️ Warning: SUPABASE_URL or SUPABASE_KEY is missing or set to default placeholders in server/.env file.\n' +
    'Please set valid credentials from your Supabase Project Dashboard.'
  );
}

// Create and export Supabase client instance
const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseKey || 'placeholder-supabase-anon-key'
);

module.exports = supabase;
