/**
 * JusticeNow — i18n setup (react-i18next).
 *
 * Three languages: English (en), Tamil (ta), Sinhala (si).
 * The chosen language is kept in React state only — we deliberately do NOT
 * persist it to localStorage, because this app should leave as little trace
 * on the device as possible.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import ta from './ta.json';
import si from './si.json';

i18n
  .use(initReactI18next) // connects i18next to React
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
      si: { translation: si },
    },
    lng: 'en',           // default language
    fallbackLng: 'en',   // show English if a key is missing in ta/si
    interpolation: {
      escapeValue: false, // React already escapes output
    },
  });

export default i18n;
