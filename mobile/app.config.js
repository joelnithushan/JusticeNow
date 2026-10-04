// Extends app.json at build time. Its ONLY job is to inject the Android Google
// Maps API key from the environment — so the key lives in mobile/.env (gitignored)
// and never lands in version control (CLAUDE.md: never commit a real credential).
//
// WHY this is needed: react-native-maps uses the Google Maps SDK on Android, which
// HARD-CRASHES the app on launch of any map screen when the manifest has no
// `com.google.android.geo.API_KEY` meta-data at all. iOS uses Apple Maps and needs
// no key, which is why the maps work in the iOS simulator but crash on Android.
//
// The key is the project's existing Google key (GOOGLE_MAPS_API_KEY). It MUST have
// "Maps SDK for Android" enabled in Google Cloud, and should be restricted to the
// com.justicenow.app package. Changing it requires an Android rebuild (prebuild
// regenerates the manifest): `npx expo run:android` or an EAS build.
module.exports = ({ config }) => ({
  ...config,
  // Theme the native Android date/time pickers to the app's navy accent (the
  // picker's `accentColor` prop is iOS-only). See plugins/withPickerTheme.js.
  plugins: [...(config.plugins || []), './plugins/withPickerTheme'],
  android: {
    ...config.android,
    config: {
      ...(config.android?.config || {}),
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
  },
});
