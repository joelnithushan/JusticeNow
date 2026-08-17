/**
 * JusticeNow (mobile) — i18n setup (react-i18next).
 *
 * Three languages: English (en), Tamil (ta), Sinhala (si).
 *
 * PRIVACY: the chosen language is kept in memory only. We deliberately do NOT
 * persist it to AsyncStorage/SecureStore — this app leaves as little trace on
 * the device as possible, matching the web client's behaviour.
 *
 * On first launch we read the device language with expo-localization and use it
 * IF it is one we support; otherwise we fall back to English.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './en.json';
import ta from './ta.json';
import si from './si.json';

// Languages the app actually ships translations for.
export const SUPPORTED_LANGUAGES = ['en', 'ta', 'si'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Pick the best starting language from the device's locale list.
 * getLocales() returns entries like { languageCode: 'ta', ... } ordered by
 * the user's preference. We take the first one we support, else English.
 */
function detectInitialLanguage(): SupportedLanguage {
  const locales = getLocales();
  for (const locale of locales) {
    const code = locale.languageCode as SupportedLanguage | null;
    if (code && SUPPORTED_LANGUAGES.includes(code)) {
      return code;
    }
  }
  return 'en';
}

i18n
  .use(initReactI18next) // connects i18next to React
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
      si: { translation: si },
    },
    lng: detectInitialLanguage(), // device language if supported, else English
    fallbackLng: 'en', // show English if a key is missing in ta/si
    interpolation: {
      escapeValue: false, // React already escapes output
    },
  });

export default i18n;
