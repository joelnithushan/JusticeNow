/**
 * JusticeNow (mobile) — Quick Exit button (survivor-safety control).
 *
 * This is the mobile counterpart of the web QuickExitButton, brought in line
 * with JNOW-14. The user this protects may be reporting someone who has
 * physical access to her phone; if that person walks in mid-report she must be
 * out of the app in one tap — screen cleared, nothing recoverable.
 *
 * THE EXIT, IN ORDER (see exitNow):
 *   a. reset() wipes ALL in-progress form state synchronously. The draft lives
 *      only in memory (ReportFormContext) — nothing was written to
 *      AsyncStorage/SecureStore, so there is nothing left on disk.
 *   b. router.replace('/exit') drops the report screen from the history stack
 *      and shows a neutral cover screen, so hardware Back cannot restore it.
 * There is deliberately NO confirmation dialog — a prompt would defeat the
 * point. (We no longer force-quit on Android: the neutral screen is the
 * discreet cover and gives a mis-tap a quiet way back, matching the web.)
 *
 * WHERE IT APPEARS
 * Mounted once in the root layout, but it hides itself on the splash (nothing
 * typed yet), on staff screens (staff are authenticated — a different threat
 * model) and on the neutral screen itself.
 *
 * APPEARANCE
 * A charcoal (#111827) circle with a white cross: deliberately NOT red (red
 * reads as danger/delete) and NOT the navy primary (would read as just another
 * button). It carries a drop shadow so it is always findable, and sits
 * bottom-right so it is thumb-reachable one-handed.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useReportForm } from '../src/context/ReportFormContext';

// The neutral screen the button escapes to (app/exit.tsx).
export const EXIT_PATH = '/exit';

/**
 * Reporter screens get the button; splash, staff and the exit screen itself do
 * not. A denylist (rather than an allowlist) means any future reporter screen
 * is protected by default — the safe failure mode is "button shown".
 */
export function isReporterScreen(pathname: string): boolean {
  if (pathname === '/') return false; // splash — nothing to clear yet
  if (pathname === EXIT_PATH) return false; // already on the neutral screen
  if (pathname.startsWith('/staff')) return false; // staff: different threat model
  return true;
}

export default function QuickExitButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { reset } = useReportForm();
  const insets = useSafeAreaInsets();

  if (!isReporterScreen(pathname)) return null;

  const exitNow = () => {
    reset(); // (a) wipe in-progress form + in-memory case data, synchronously
    router.replace(EXIT_PATH); // (b) neutral screen, drops the report from history
  };

  return (
    <Pressable
      onPress={exitNow}
      // Bottom-right, clear of the home indicator, thumb-reachable one-handed.
      style={[styles.button, { bottom: insets.bottom + 16 }]}
      accessibilityRole="button"
      accessibilityLabel={t('quickExit.ariaLabel')}
      hitSlop={8}
    >
      {/* The cross is decorative; the Pressable's accessibilityLabel names it. */}
      <Text style={styles.cross} importantForAccessibility="no" accessibilityElementsHidden>
        ✕
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    zIndex: 1000, // float above every screen's content
    width: 56, // min 56×56 target — usable in a hurry, one hand
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    // Deliberately charcoal — NOT red, NOT the navy primary. See file header.
    backgroundColor: '#111827',
    // The app's one distinctive drop shadow, so the control is always findable.
    elevation: 6, // Android
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  cross: {
    color: '#ffffff',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
  },
});
