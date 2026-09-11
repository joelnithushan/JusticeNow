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

// Google sign-in is an OPTIONAL staff feature. If its env vars are absent (e.g.
// a build without secrets, or CI), we must NOT crash the whole app — createClient
// throws on an empty URL/key. Fall back to harmless placeholders so the app still
// renders; the Google flow simply fails at use-time instead of at import-time.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
