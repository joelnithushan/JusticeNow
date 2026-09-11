/**
 * JusticeNow (web) — Supabase client, used ONLY for the staff "Sign in with
 * Google" flow. Reporters never authenticate, so this is never used on any
 * reporter-facing page.
 *
 * LEAVE NO TRACE: persistSession is OFF on purpose — like the rest of staff auth,
 * the session lives in memory only and a page reload requires signing in again.
 * We use the implicit flow so the redirect returns the token in the URL fragment
 * and `detectSessionInUrl` reads it without needing anything stored on the
 * device. The Supabase session is immediately exchanged for our own JWT (see
 * loginStaffGoogle) and then discarded.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
