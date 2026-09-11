/**
 * JusticeNow (web) — Staff profile state (in-memory).
 *
 * WHY THIS EXISTS
 * The signed-in staffer's own profile (name, NIC-derived gender/dob, avatar,
 * completion flag, auth method) is needed in several places: the profile page,
 * the nav-bar avatar, and the completion gate. Rather than each fetch it, this
 * context loads GET /staff/me once per session and shares it.
 *
 * PRIVACY / LEAVE NO TRACE: this is React state ONLY, exactly like AuthContext
 * — the profile is never written to localStorage/sessionStorage. It lives only
 * while the tab is open; a reload drops it (and the session) by design. Must be
 * mounted INSIDE AuthProvider so it can read useAuth().isAuthenticated.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fetchMe } from '../api/client';
import { useAuth } from './AuthContext';

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load (or reload) the caller's own profile. Exposed as `refresh` so the
  // profile page can re-pull after a save / avatar upload. Never logs the
  // response — a profile carries a real person's NIC, phone, etc.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchMe();
      setProfile(res.data.data);
    } catch (err) {
      // Do not log err (may echo profile fields). Surface a generic flag; the
      // profile page decides how to present it.
      setError('load-failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on login; clear on logout so a signed-out session leaves no profile
  // lingering in memory (and the next staffer starts clean).
  useEffect(() => {
    if (!isAuthenticated) {
      setProfile(null);
      setError('');
      setLoading(false);
      return;
    }
    // Ignore the rejection here — refresh() already records `error`, and an
    // unhandled promise would only add noise (no identifying data to log).
    refresh().catch(() => {});
  }, [isAuthenticated, refresh]);

  const value = useMemo(
    () => ({ profile, loading, error, refresh, setProfile }),
    [profile, loading, error, refresh],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used inside a ProfileProvider');
  }
  return ctx;
}
