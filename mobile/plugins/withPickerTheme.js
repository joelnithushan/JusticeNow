/**
 * Expo config plugin — theme the native Android date/time pickers to match the app.
 *
 * WHY: @react-native-community/datetimepicker's `accentColor` prop is iOS-only.
 * On Android the calendar/clock dialogs take their highlight (selected day, header,
 * OK/Cancel) from the Activity theme's `colorAccent` / `colorControlActivated`.
 * Our generated AppTheme sets only `colorPrimary`, so the pickers fell back to the
 * default AppCompat accent (teal/pink) and looked off-brand. This sets the native
 * accent to the app's navy (colors.primary) so the pickers match the rest of the UI.
 *
 * Android-only + applied at prebuild; iOS is themed via the `accentColor` prop.
 */
const { withAndroidColors, withAndroidStyles, AndroidConfig } = require('@expo/config-plugins');

// Keep in sync with colors.primary in src/theme.ts.
const ACCENT = '#0A3559';

const withPickerTheme = (config) => {
  // 1) Register the accent colour resource.
  config = withAndroidColors(config, (cfg) => {
    cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, {
      name: 'pickerAccent',
      value: ACCENT,
    });
    return cfg;
  });

  // 2) Point the app theme's accent/control-activated at it so the native
  //    date & time dialogs inherit the navy highlight. We locate AppTheme by
  //    NAME (its parent is DayNight.NoActionBar, so the parent-matching helpers
  //    wouldn't find it and would spawn a duplicate).
  config = withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults;
    styles.resources.style = styles.resources.style || [];
    const appTheme = styles.resources.style.find((s) => s.$ && s.$.name === 'AppTheme');
    if (appTheme) {
      appTheme.item = appTheme.item || [];
      const setItem = (name, value) => {
        const existing = appTheme.item.find((i) => i.$ && i.$.name === name);
        if (existing) existing._ = value;
        else appTheme.item.push({ _: value, $: { name } });
      };
      setItem('colorAccent', '@color/pickerAccent');
      setItem('colorControlActivated', '@color/pickerAccent');
      // Curve the dialog corners (date/time pickers + alerts) to match the app's
      // rounded cards. `android:dialogCornerRadius` is honoured on API 28+.
      setItem('android:dialogCornerRadius', '20dp');
    }
    return cfg;
  });

  return config;
};

module.exports = withPickerTheme;
