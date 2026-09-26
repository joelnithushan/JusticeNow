/**
 * JusticeNow (mobile) — Global bottom Back control (bottom-left, floating).
 *
 * By product decision the back control lives at the BOTTOM of the screen, not in
 * the header (headers now carry the brand logo on the left instead). This floats
 * once, mounted in the root layout, so every screen gets a consistent back at the
 * bottom-left — thumb-reachable.
 *
 * VISIBILITY: shown only when there is history to pop (router.canGoBack()), so
 * top-level screens reached via replace (Home, staff tabs, login) don't show it.
 * A small denylist covers screens that provide their OWN step-aware bottom back
 * (the report wizard, 2FA setup) so we never render two.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/theme';

// Top-level screens that should NOT show a back control at all. (Staff login has
// its own header back + "Back to home" footer, so it opts out here too.)
const NO_BACK = new Set(['/', '/exit', '/onboarding', '/preferences', '/staff/login', '/staff/register']);
// Screens that render their own step-aware bottom back — skip the global one.
const OWN_BACK = new Set(['/report', '/staff/mfa-setup']);

export default function BottomBackButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (NO_BACK.has(pathname) || OWN_BACK.has(pathname)) return null;

  // Reporter sub-pages are always reached from Home, so they always get a back
  // (fall back to Home when there's no history — e.g. a deep link). Staff and
  // other screens show it only when there is actually history to pop, so the
  // top-level staff tabs (reached via replace) don't show a stray back.
  const isReporterSub = !pathname.startsWith('/staff');
  const canGoBack = router.canGoBack();
  if (!canGoBack && !isReporterSub) return null;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Pressable
      onPress={goBack}
      style={[styles.button, { bottom: insets.bottom + 16 }]}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={8}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M15 6 l-6 6 l6 6"
          stroke={colors.primaryText}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={styles.label}>{t('common.back')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 16,
    zIndex: 1000, // float above every screen's content
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 24,
    backgroundColor: colors.primary,
    // Distinctive drop shadow so the control is always findable.
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  label: { color: colors.primaryText, fontSize: 15, fontWeight: '700' },
});
