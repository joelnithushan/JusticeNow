/**
 * JusticeNow (mobile) — Quick Exit button.
 *
 * SAFETY FEATURE. This is the mobile counterpart of the web QuickExitButton.
 * It is rendered once in the root layout as a floating control, so it is
 * reachable from EVERY screen — for the moment someone walks in on the reporter
 * mid-form.
 *
 * On press it must, immediately:
 *   1. Clear ALL in-progress form state. The draft lives only in React state
 *      (see ReportFormContext) — reset() wipes it from memory. Nothing was ever
 *      written to AsyncStorage/SecureStore, so there is nothing left on disk.
 *   2. Reset navigation to a neutral screen (Home), discarding the history stack
 *      so pressing "back" cannot return to the report.
 *   3. On Android, leave the app entirely via BackHandler.exitApp().
 *      NOTE: iOS provides NO supported way to programmatically quit an app
 *      (Apple rejects apps that call exit()), so on iOS we can only reset to the
 *      neutral screen — which we have already done in step 2.
 */

import React from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useReportForm } from '../src/context/ReportFormContext';

export default function QuickExitButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const { reset } = useReportForm();
  const insets = useSafeAreaInsets();

  const exitNow = () => {
    // 1. Wipe in-progress form data from memory.
    reset();
    // 2. Drop the navigation history and land on the neutral Home screen.
    router.replace('/');
    // 3. On Android, actually leave the app. iOS has no supported exit API.
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
  };

  return (
    <Pressable
      onPress={exitNow}
      // Sit clear of the status bar / notch using the safe-area inset.
      style={[styles.button, { top: insets.top + 8 }]}
      accessibilityRole="button"
      accessibilityLabel={t('quickExit.label')}
      hitSlop={8}
    >
      <Text style={styles.label}>{t('quickExit.label')} ✕</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 12,
    zIndex: 1000, // float above every screen's content
    backgroundColor: '#b00020',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    elevation: 6, // Android shadow
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
