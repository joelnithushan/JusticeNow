# JusticeNow — Mobile app (Expo / React Native)

The native mobile client for **JusticeNow**, the anonymous human rights case
reporting and tracking app for Sri Lanka. It reuses the **same Express +
Supabase backend** as the web PWA in `/client`; this folder adds a phone app on
top of that shared API — it is an **addition**, not a replacement.

Reporters submit a case **without any account** and receive a **reference code**,
which is their only handle on the case. Only staff (attorneys, NGO officers)
authenticate. Case types: harassment, unlawful detention, land dispute,
discrimination, official misconduct, other.

## Tech

- **Expo** (React Native) with **expo-router** (file-based routing), TypeScript
- **axios** for the shared REST API
- **react-i18next** + **expo-localization** — English / Tamil / Sinhala
- **@react-native-picker/picker**, **@react-native-community/datetimepicker**,
  **expo-document-picker** for the report form

## Quick start

```bash
cd mobile
npm install
cp .env.example .env          # then set EXPO_PUBLIC_API_URL to your LAN IP
npx expo start                # scan the QR code with Expo Go
```

> **A physical phone cannot reach `localhost`.** `localhost` on the phone means
> the phone itself. Put your **computer's LAN IP** in `.env`
> (e.g. `http://192.168.1.42:5000/api`), and make sure the phone and computer
> are on the **same Wi-Fi network** and the `/server` API is running.

See [`BUILDING.md`](BUILDING.md) for full dev/build instructions, including how
to produce an installable **APK** with EAS Build (no Android Studio needed).

## Safety design (do not weaken these)

These mirror the web app's privacy guarantees and are deliberate:

- **No persistent storage of case data.** In-progress form data lives in React
  state only (`src/context/ReportFormContext.tsx`). We do **not** use
  AsyncStorage, SecureStore, or any on-device storage for case data or drafts —
  a half-written report must never sit on a device someone else might inspect.
- **Quick Exit** (`components/QuickExitButton.tsx`) is on every screen. It clears
  all in-progress form state, resets navigation to the neutral Home screen, and
  on **Android** leaves the app via `BackHandler.exitApp()`. On **iOS** there is
  no supported way to quit programmatically, so it resets to Home only.
- **No reporter-identifying fields.** No name, email, phone, or device id — ever.
- **No case data in logs.**
- **Language choice is kept in memory only** (not persisted).

## Structure

```
mobile/
  app/                       expo-router routes (file = screen)
    _layout.tsx              root: i18n init, providers, Stack, Quick Exit overlay
    index.tsx                Home
    report/
      index.tsx              3-step report form
      success.tsx            reference-code screen
    status.tsx               Check status (placeholder, Sprint 2)
    directory.tsx            Directory (placeholder, Sprint 2)
    staff/
      login.tsx              Staff login (placeholder)
      reports.tsx            Staff reports list
  components/
    LanguageSwitcher.tsx
    QuickExitButton.tsx
  src/
    api/client.ts            axios instance + submitReport / fetchReports
    constants.ts             CASE_TYPES, DISTRICTS, evidence rules (mirror server)
    context/ReportFormContext.tsx   in-memory report draft (+ reset for Quick Exit)
    i18n/                    index.ts + en/ta/si JSON
    theme.ts                 shared colours + styles
  app.json                   Expo config (name, slug, android.package, splash)
  eas.json                   EAS build profiles (preview = installable APK)
  .env.example               EXPO_PUBLIC_API_URL template
  BUILDING.md                dev + APK build guide
```
