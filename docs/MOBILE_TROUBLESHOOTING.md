# Mobile troubleshooting (Expo)

Common issues when running `/mobile` against the shared Express API. This is
operator documentation only — it does not change application behaviour.

## Phone cannot reach the API

**Symptom:** report submit or status check fails; network error in Expo logs.

**Cause:** `EXPO_PUBLIC_API_URL` points at `localhost`. On a phone, `localhost`
is the phone itself, not your computer.

**Fix:**

1. On the PC, run `ipconfig` (Windows) and note the Wi‑Fi **IPv4 Address**.
2. In `mobile/.env` set:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.x.x:5000/api
   ```
3. Phone and PC on the **same Wi‑Fi**.
4. Restart Expo (`npx expo start`) after editing `.env` — Expo inlines
   `EXPO_PUBLIC_*` at start time.
5. Confirm http://YOUR-LAN-IP:5000/api/health opens from the phone’s browser
   (or from the PC using that LAN IP).

## `Cannot find native module 'ExpoMediaLibraryNext'`

**Symptom:** crash on the report success screen when importing
`expo-media-library`.

**Cause:** In Expo SDK 57 the **default** import of `expo-media-library` loads
the Next native module. Expo Go may not include that module yet.

**Fix (in code, already the intended pattern for Expo Go):**

```ts
import * as MediaLibrary from 'expo-media-library/legacy';
```

Same idea as `expo-file-system/legacy`. Reload the app after the change.

**Note:** Saving to the gallery may still be limited inside Expo Go on newer
Android versions. A development / EAS build has full media-library access. Copy
to clipboard still works without MediaLibrary.

## Metro stuck or stale bundle

```bash
cd mobile
npx expo start --clear
```

If the QR code does not show in an IDE terminal, open that terminal and press
`s` (Expo Go), or enter `exp://YOUR-LAN-IP:8081` in Expo Go manually.

## Staff Google sign-in on mobile

Requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
`mobile/.env`. Reporters never use Supabase Auth — those keys are for the
optional staff Google flow only.

## Still stuck?

1. API healthy on LAN? `/api/health`
2. `JWT_SECRET` set in `server/.env`?
3. Schema + migrations applied in Supabase?
4. Expo and phone on same network; no guest Wi‑Fi client isolation
