/**
 * JusticeNow (mobile) — Onboarding "seen" flag.
 *
 * WHY THIS EXISTS
 * The intro carousel should show on launch, then step aside for the app. We
 * track whether it has been seen THIS SESSION only.
 *
 * PRIVACY: this is in-memory (React state) on purpose — we do NOT use
 * AsyncStorage/SecureStore. That matches the app's "leave no trace on the
 * device" stance: a fresh cold start simply shows the intro again, which is the
 * accepted trade-off. Nothing about the user or their case is stored here.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface OnboardingContextValue {
  splashSeen: boolean; // brand splash already shown this session
  markSplashSeen: () => void;
  seen: boolean; // onboarding carousel already shown this session
  markSeen: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  // In-memory only; both reset on every cold start (see file header). Kept in
  // context (not local screen state) so re-entering Home after onboarding does
  // not replay the splash.
  const [splashSeen, setSplashSeen] = useState(false);
  const [seen, setSeen] = useState(false);

  const markSplashSeen = useCallback(() => setSplashSeen(true), []);
  const markSeen = useCallback(() => setSeen(true), []);

  const value = useMemo(
    () => ({ splashSeen, markSplashSeen, seen, markSeen }),
    [splashSeen, markSplashSeen, seen, markSeen],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used inside an OnboardingProvider');
  }
  return ctx;
}
