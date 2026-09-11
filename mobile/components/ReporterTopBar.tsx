/**
 * JusticeNow (mobile) — Reporter top bar (Back + optional title).
 *
 * A slim, safe-area-aware header for reporter screens (Home/Report/Status/
 * Directory/About). It provides a real Back button on the LEFT and an optional
 * centred title.
 *
 * NOTE: there is deliberately NO Quick Exit control here — the Quick Exit
 * button already floats bottom-right globally (mounted once in the root layout,
 * see components/QuickExitButton.tsx). Duplicating it would be redundant and
 * could crowd the thumb-reach zone.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/theme';

type Props = {
  title?: string;
  /** Hide the back button (e.g. terminal screens like the success page) while
   *  keeping the centred title so every page still has a consistent header. */
  showBack?: boolean;
  /** Override the back action (e.g. a wizard stepping to the previous step
   *  instead of leaving the screen). Falls back to router.back()/Home. */
  onBack?: () => void;
};

// Simple left-pointing chevron (monochrome, tinted to the brand navy).
function BackChevron({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5 L8 12 L15 19"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ReporterTopBar({ title, showBack = true, onBack }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A caller-supplied handler wins (e.g. a wizard step-back). Otherwise go back
  // if there is history to pop; else fall back to Home so the arrow always does
  // something (deep link, cold start, or a redirect that left no back stack).
  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      {showBack ? (
        <Pressable
          onPress={goBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={8}
        >
          <BackChevron color={colors.primaryText} />
        </Pressable>
      ) : (
        // Spacer keeps the title optically centred when there's no back button.
        <View style={styles.backButton} />
      )}

      {/* Centred title; the button and this share width so the title stays
          optically centred. The chevron already carries the accessible label. */}
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}

      {/* Spacer mirroring the back button so the title centres correctly. */}
      <View style={styles.backButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
    // Brand blue header (extends up behind the status bar via the top inset).
    backgroundColor: colors.primary,
  },
  backButton: {
    width: 44, // min 44×44 touch target
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryText,
  },
});
