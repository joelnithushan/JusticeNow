/**
 * JusticeNow — Browser-side Supabase client.
 *
 * PURPOSE: This mirrors server/config/supabase.js in intent — it creates a
 * single, reusable Supabase client — but the browser version has two key
 * differences from the server one:
 *
 *   1.  It uses VITE_SUPABASE_ANON_KEY (the public anon key), NOT the
 *       service-role key. The anon key is safe to ship in the browser bundle.
 *
 *   2.  persistSession is left at its default (true), so Supabase stores the
 *       staff JWT in localStorage automatically. This is intentional and is the
 *       ONLY thing stored in browser storage — no case data, no reporter data,
 *       ever. Supabase handles token refresh transparently.
 *
 * PRIVACY NOTE: Reporters never interact with this client. It is only imported
 * by the auth context and staff-facing components.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  // Die loudly in development so misconfiguration is caught immediately.
  // In production a missing env var would silently break auth, which is worse.
  throw new Error(
    'Missing Supabase config: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.\n' +
    'Copy client/.env.example to client/.env and fill in the values from ' +
    'your Supabase Dashboard → Project Settings → API.'
  );
}

// createClient with default options: persistSession=true keeps the staff JWT
// in localStorage so the session survives page refresh.
const supabase = createClient(supabaseUrl, supabaseAnon);

export default supabase;
