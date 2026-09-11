/**
 * JusticeNow (mobile) — Persisted UI preferences (device storage).
 *
 * SCOPE (see CLAUDE.md): the ONLY things allowed on the device are non-case UI
 * preferences — the chosen language + district and a "setup complete" flag, so a
 * returning user is not re-asked. CASE DATA IS NEVER PERSISTED HERE: report
 * drafts, narratives, reference codes and evidence stay in memory and are wiped
 * by Quick Exit. Do not add case content to these keys.
 *
 * Residual risk accepted by product decision: a saved language can hint at a
 * reporter's ethnicity and district reveals coarse location, so on a shared or
 * seized phone these leave a trace.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  language: 'jn.pref.language',
  district: 'jn.pref.district',
  setupComplete: 'jn.pref.setupComplete',
};

export type StoredPrefs = {
  language: string | null;
  district: string | null;
  setupComplete: boolean;
};

/** Load persisted preferences. Never throws — returns empty defaults on error. */
export async function loadPrefs(): Promise<StoredPrefs> {
  try {
    const entries = await AsyncStorage.multiGet([KEYS.language, KEYS.district, KEYS.setupComplete]);
    const map = Object.fromEntries(entries);
    return {
      language: map[KEYS.language] || null,
      district: map[KEYS.district] || null,
      setupComplete: map[KEYS.setupComplete] === 'true',
    };
  } catch {
    return { language: null, district: null, setupComplete: false };
  }
}

/** Persist just the language (e.g. when toggled later via the switcher). Best-effort. */
export async function saveLanguage(language: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.language, language);
  } catch {
    // Best-effort.
  }
}

/** Persist the chosen language + district and mark setup complete. Best-effort. */
export async function savePrefs(prefs: { language: string; district: string | null }): Promise<void> {
  try {
    const pairs: [string, string][] = [
      [KEYS.language, prefs.language],
      [KEYS.setupComplete, 'true'],
    ];
    if (prefs.district) pairs.push([KEYS.district, prefs.district]);
    else await AsyncStorage.removeItem(KEYS.district);
    await AsyncStorage.multiSet(pairs);
  } catch {
    // Best-effort — a failed write just means the user is asked again next time.
  }
}
