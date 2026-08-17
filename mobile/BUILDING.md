# Building & running the JusticeNow mobile app

This is the Expo (React Native) app in `/mobile`. It shares the same Express +
Supabase backend as the web PWA in `/client` — it does not have its own server.

New to React Native? You only need Node.js and a phone. You do **not** need
Android Studio or Xcode: the app runs in **Expo Go** during development, and the
release APK is built in the cloud by **EAS Build**.

---

## 1. One-time setup

```bash
cd mobile
npm install
cp .env.example .env
```

Then edit `.env` and set `EXPO_PUBLIC_API_URL` to your computer's **LAN IP**
(not `localhost`), because a physical phone cannot reach `localhost` — that
address means the phone itself. Find your IP:

```bash
# macOS
ipconfig getifaddr en0
# Windows -> run `ipconfig` and read "IPv4 Address"
# Linux
hostname -I
```

Example `.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:5000/api
```

The phone and the computer **must be on the same Wi-Fi network**, and the
Express server in `/server` must be running (`npm run dev` from the repo root or
`cd server && npm run dev`).

---

## 2. Run it on your phone (development)

```bash
cd mobile
npx expo start
```

1. Install **Expo Go** from the App Store / Play Store on your phone.
2. Scan the QR code shown in the terminal:
   - **Android:** scan it from inside the Expo Go app.
   - **iOS:** scan it with the Camera app, then tap the banner.
3. The app loads over the local network. Edit a file and it hot-reloads.

> If the app loads but API calls fail, it is almost always the `.env` IP or a
> firewall — re-check `EXPO_PUBLIC_API_URL` and that both devices share the
> Wi-Fi. After changing `.env`, stop and restart `npx expo start`.

---

## 3. Produce an installable APK (EAS Build)

EAS builds in Expo's cloud, so **Android Studio is not required**.

```bash
npm install -g eas-cli     # once, globally
eas login                  # log in with your Expo account (free to create)

cd mobile
eas build -p android --profile preview
```

The `preview` profile is configured in `eas.json` to output a **`.apk`**
(`android.buildType: "apk"`), which installs directly on any Android phone —
unlike the Play Store `.aab` that the `production` profile produces.

When the build finishes, the CLI prints a **download URL**. You can also find
the finished APK any time at **https://expo.dev** → your project → **Builds** →
open the latest build → **Download**. Copy that APK to an Android phone and open
it to install (you may need to allow "install from unknown sources").

---

## 4. Handy commands

| Command | What it does |
|---|---|
| `npx expo start` | Start the dev server (QR code for Expo Go) |
| `npx expo start --clear` | Same, clearing the Metro cache |
| `npx tsc --noEmit` | Type-check the app |
| `npx expo-doctor` | Check for dependency/config problems |
| `eas build -p android --profile preview` | Build an installable APK in the cloud |
| `eas build -p android --profile production` | Build a Play Store AAB |
