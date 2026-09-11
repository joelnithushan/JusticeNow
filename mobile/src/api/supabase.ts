/**
 * JusticeNow (mobile) — Supabase client, used ONLY for the staff "Sign in with
 * Google" flow. Reporters never authenticate, so this is never used on any
 * reporter-facing screen.
 *
 * LEAVE NO TRACE: persistSession is OFF — like the rest of staff auth, the
 * session lives in memory only (no AsyncStorage/SecureStore), so a cold start
 * requires signing in again. We use the implicit flow so the OAuth redirect
 * returns the token in the URL fragment (parsed by the login screen) without
 * needing a PKCE verifier stored on the device. The Supabase session is
 * immediately exchanged for our own JWT and then discarded.
 */

// URL support for the Supabase SDK under Hermes/React Native.
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});
