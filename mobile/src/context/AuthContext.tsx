/**
 * JusticeNow (mobile) — Staff authentication state (in-memory).
 *
 * WHY THIS EXISTS
 * Only STAFF (officer/attorney/admin) ever authenticate — reporters never log
 * in, by design. This context holds the staff JWT and the decoded staff record
 * for the current session so staff screens can guard themselves and axios can
 * attach the token to staff-only calls.
 *
 * PRIVACY / LEAVE NO TRACE: this is React state ONLY. We deliberately do NOT
 * persist the token to AsyncStorage/SecureStore. A cold start therefore drops
 * the session and the staff member re-logs in — that is intended and the safest
 * option: no auth material lingers on the device where it could be recovered.
 * Mirrors OnboardingContext / PreferencesContext exactly.
 *
 * On every login/logout we also push the token into the api client via
 * setStaffToken() so the SEPARATE staffApi axios instance carries it — and the
 * reporter `api` instance never does (see src/api/client.ts).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { setStaffToken } from '../api/client';

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: string;
  organisation_id: string;
}

interface LoginPayload {
  token: string;
  staff: Staff;
}

interface AuthContextValue {
  token: string | null;
  staff: Staff | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (payload: LoginPayload) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // In-memory only; both reset on every cold start (see file header). No device
  // storage — staff re-login on relaunch is the accepted, safest trade-off.
  const [token, setToken] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);

  const login = useCallback((payload: LoginPayload) => {
    setToken(payload.token);
    setStaff(payload.staff);
    // Arm the staff axios instance so subsequent staff calls are authorized.
    setStaffToken(payload.token);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setStaff(null);
    // Disarm the staff axios instance so no stale token leaks onto later calls.
    setStaffToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      staff,
      isAuthenticated: token !== null,
      // Admin-only surfaces (staff management, org management) key off this.
      isAdmin: staff?.role === 'admin',
      login,
      logout,
    }),
    [token, staff, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
