/**
 * JusticeNow (mobile) — Staff profile state (in-memory).
 *
 * WHY THIS EXISTS
 * Once a staffer is authenticated we fetch their OWN profile (GET /staff/me) and
 * expose it to the staff screens: the profile tab reads + edits it, and the tab
 * layout reads `profile.profile_completed` to gate the other tabs until the
 * profile is complete. Reporters never authenticate, so their session is never
 * authed and this context simply never fetches for them.
 *
 * PRIVACY / LEAVE NO TRACE: this is React state ONLY — nothing is persisted to
 * the device (mirrors AuthContext). On logout the profile is dropped so no stale
 * profile lingers, and a cold start re-fetches after re-login.
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
import type { StaffProfile } from '../api/client';
import { useAuth } from './AuthContext';

interface ProfileContextValue {
  profile: StaffProfile | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  setProfile: (profile: StaffProfile) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    // No authed session (e.g. a reporter, or before login) → nothing to fetch.
    if (!isAuthenticated) {
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await fetchMe();
      setProfile(res.data.data);
    } catch {
      // Do NOT log — a profile carries staff PII (name, NIC, phone). The screen
      // surfaces the error state; the tab gate simply keeps waiting.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch when a session appears; drop the profile when it goes away so no stale
  // profile lingers across a logout/login of a different account.
  useEffect(() => {
    if (isAuthenticated) {
      refresh();
    } else {
      setProfile(null);
      setError(false);
      setLoading(false);
    }
  }, [isAuthenticated, refresh]);

  const value = useMemo<ProfileContextValue>(
    () => ({ profile, loading, error, refresh, setProfile }),
    [profile, loading, error, refresh],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used inside a ProfileProvider');
  }
  return ctx;
}
