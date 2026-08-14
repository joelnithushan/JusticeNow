/**
 * JusticeNow — i18n setup (react-i18next).
 *
 * Three languages: English (en), Tamil (ta), Sinhala (si).
 *
 * On first load, the browser's preferred language is detected
 * (navigator.language / Accept-Language order).  If the detected
 * language is not one of the three supported codes it falls back to
 * English.
 *
 * PRIVACY CONSTRAINT: the chosen language is kept in memory only.
 * We deliberately set caches: [] so that i18next-browser-languagedetector
 * writes NOTHING to localStorage, sessionStorage, or cookies.  This app
 * must leave as little trace on the device as possible.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './en.json';
import ta from './ta.json';
import si from './si.json';

i18n
  // 1. Detect browser language (navigator.language etc.)
  .use(LanguageDetector)
  // 2. Connect i18next to React
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
      si: { translation: si },
    },

    // Detection order: navigator language → HTML lang attr.
    // We do NOT include 'localStorage', 'sessionStorage', or 'cookie'
    // so that the detector never reads from or writes to persistent storage.
    detection: {
      order: ['navigator', 'htmlTag'],
      caches: [], // ← no persistent storage; language choice lives in memory only
    },

    fallbackLng: 'en',   // show English if browser language is not ta/si/en
    supportedLngs: ['en', 'ta', 'si'], // only accept our three locales
    nonExplicitSupportedLngs: true,   // 'ta-LK' → 'ta', 'si-LK' → 'si'

    interpolation: {
      escapeValue: false, // React already escapes output
    },
  });

export default i18n;
