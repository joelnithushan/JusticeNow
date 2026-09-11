/**
 * JusticeNow (web) — Staff authentication state (in-memory).
 *
 * WHY THIS EXISTS
 * Only STAFF (officer/attorney/admin) ever authenticate — reporters never log
 * in, by design. This context holds the staff JWT and the staff record for the
 * current session so staff routes can guard themselves and axios can attach the
 * token to staff-only calls.
 *
 * PRIVACY / LEAVE NO TRACE: this is React state ONLY. We deliberately do NOT
 * persist the token to localStorage/sessionStorage. A reload therefore drops
 * the session and the staff member re-logs in — that is intended and the safest
 * option: no auth material lingers on the device where it could be recovered.
 *
 * On every login/logout we also push the token into the api client via
 * setStaffToken() so the SEPARATE staffApi axios instance carries it — and the
 * reporter `api` instance never does (see src/api/client.js).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { setStaffToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // In-memory only; both reset on every reload (see file header). No device
  // storage — staff re-login on relaunch is the accepted, safest trade-off.
  const [token, setToken] = useState(null);
  const [staff, setStaff] = useState(null);

  const login = useCallback(({ token: nextToken, staff: nextStaff }) => {
    setToken(nextToken);
    setStaff(nextStaff);
    // Arm the staff axios instance so subsequent staff calls are authorized.
    setStaffToken(nextToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setStaff(null);
    // Disarm the staff axios instance so no stale token leaks onto later calls.
    setStaffToken(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      staff,
      isAuthenticated: token !== null,
      // Admin-only surfaces (staff management, org management, audit) key off this.
      isAdmin: staff?.role === 'admin',
      login,
      logout,
    }),
    [token, staff, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
