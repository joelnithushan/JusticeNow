/**
 * JusticeNow — Auth context (STAFF ONLY).
 *
 * CRITICAL: This context exists solely for staff authentication.
 * Reporters never log in. This context must never be used in any
 * reporter-facing component or page.
 *
 * WHAT THIS PROVIDES:
 *   - user    : the Supabase User object when authenticated, null otherwise.
 *   - session : the raw Supabase Session (includes the JWT). Usually you only
 *               need `user`; `session` is here if a component needs the token.
 *   - loading : true until the initial session check resolves. ProtectedRoute
 *               waits for this so it never flashes a redirect on refresh.
 *   - login   : async (email, password) → calls Supabase signInWithPassword.
 *               Throws a GENERIC error message regardless of the underlying
 *               cause — this prevents email enumeration attacks.
 *   - logout  : async () → signs out and navigates to the public home page.
 *
 * SESSION PERSISTENCE:
 *   Supabase stores the staff JWT in localStorage automatically (via the client
 *   created in lib/supabaseClient.js). We do not touch storage ourselves.
 *   Nothing about case reports or reporters is ever stored in the browser.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabaseClient';

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

// ── Provider ─────────────────────────────────────────────────────────────────

/**
 * Wrap the staff section of the app (or the whole App) in this provider.
 * It resolves the current session before rendering children, so ProtectedRoute
 * sees the correct auth state on first paint — no redirect flash.
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate();

  // user: Supabase User object | null
  const [user, setUser] = useState(null);
  // session: Supabase Session | null (includes the JWT)
  const [session, setSession] = useState(null);
  // loading: true until the initial getSession() call returns.
  // ProtectedRoute renders a neutral spinner while this is true.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ── 1. Hydrate from the persisted session on mount ──
    // Supabase stores the JWT in localStorage; getSession() reads it without
    // making a network request (the token is validated locally).
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false); // only now is it safe for ProtectedRoute to decide
    });

    // ── 2. Keep state in sync with Supabase's own token lifecycle ──
    // onAuthStateChange fires on: sign-in, sign-out, token refresh.
    // This ensures that if the token expires Supabase refreshes it silently,
    // and our state stays correct without manual polling.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
      }
    );

    // Clean up the listener when the provider unmounts.
    return () => subscription.unsubscribe();
  }, []);

  // ── login ─────────────────────────────────────────────────────────────────

  /**
   * Sign in with email + password.
   *
   * SECURITY: If Supabase returns any error (wrong password, unknown email,
   * rate-limit, etc.) we throw the SAME generic message. This prevents an
   * attacker from discovering which email addresses have accounts by comparing
   * error messages.
   *
   * @param {string} email
   * @param {string} password
   * @throws {Error} Always a generic error code — never the raw Supabase message.
   */
  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Deliberately generic — do NOT surface error.message to the user.
      throw new Error('auth/invalid-credentials');
    }
    // On success, onAuthStateChange fires and sets user + session automatically.
  }, []);

  // ── logout ────────────────────────────────────────────────────────────────

  /**
   * Sign out and return to the public home page.
   * Supabase clears its localStorage entry; our state is reset by onAuthStateChange.
   */
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate('/');
  }, [navigate]);

  // ── Context value ─────────────────────────────────────────────────────────

  const value = { user, session, loading, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Convenience hook — use this in any staff component instead of useContext directly.
 *
 * @example
 *   const { user, login, logout, loading } = useAuth();
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      'useAuth() must be used inside <AuthProvider>. ' +
      'Make sure AuthProvider wraps the component tree in App.jsx.'
    );
  }
  return ctx;
}

export default AuthContext;
