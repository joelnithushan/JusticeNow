/**
 * JusticeNow (mobile) — User preferences (persisted on device).
 *
 * Holds the chosen district and the "setup complete" flag, and applies the saved
 * language on launch. By product decision (see CLAUDE.md) these UI preferences
 * ARE persisted to the device so a returning user is not re-asked — first launch
 * asks (onboarding → preferences), later launches skip straight to Home with the
 * saved language/district applied.
 *
 * NOT PERSISTED HERE: any case data. Report drafts, narratives, reference codes
 * and evidence stay in memory and are wiped by Quick Exit. Residual risk of
 * persisting language/district is documented in src/storage.ts and CLAUDE.md.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import i18n from '../i18n';
import { loadPrefs, savePrefs } from '../storage';

interface PreferencesValue {
  /** True once persisted prefs have been read from the device (gate the UI on this). */
  hydrated: boolean;
  /** True if the user has finished first-time setup (persisted). */
  setupComplete: boolean;
  district: string | null;
  setDistrict: (d: string | null) => void;
  /** Persist the chosen language + district and mark setup complete. */
  completeSetup: (language: string, district: string | null) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [district, setDistrict] = useState<string | null>(null);

  // On launch, read persisted prefs and apply the saved language before the app
  // routes, so a returning user lands on Home in their chosen language.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await loadPrefs();
      if (cancelled) return;
      if (prefs.language) i18n.changeLanguage(prefs.language);
      if (prefs.district) setDistrict(prefs.district);
      setSetupComplete(prefs.setupComplete);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeSetup = useCallback(async (language: string, chosenDistrict: string | null) => {
    await savePrefs({ language, district: chosenDistrict });
    setDistrict(chosenDistrict);
    setSetupComplete(true);
  }, []);

  const value = useMemo(
    () => ({ hydrated, setupComplete, district, setDistrict, completeSetup }),
    [hydrated, setupComplete, district, completeSetup],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used inside a PreferencesProvider');
  }
  return ctx;
}
