/**
 * JusticeNow (mobile) — Reporter top bar (app bar + optional headline).
 *
 * A consistent header for reporter screens: a navy app bar with a BACK control,
 * the brand mark, and the "JusticeNow" wordmark — all on the LEFT — and the screen
 * title rendered below as a big left-aligned headline on white (matching the login
 * / create-account / guidance designs).
 *
 * The back control is IN the header (top-left). A caller may override the action
 * (e.g. a wizard stepping to the previous step); otherwise it pops history, or
 * falls back to Home when there is nothing to pop (e.g. a deep link).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BrandLogo from './BrandLogo';
import { colors } from '../src/theme';

type Props = {
  title?: string;
  /** Hide the back control (e.g. terminal screens like the success page). */
  showBack?: boolean;
  /** Override the back action (e.g. a wizard stepping to the previous step). */
  onBack?: () => void;
};

export default function ReporterTopBar({ title, showBack = true, onBack }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View>
      {/* Navy app bar: back + logo + wordmark, all on the left. */}
      <View style={[styles.appbar, { paddingTop: insets.top + 10 }]}>
        {showBack ? (
          <Pressable
            onPress={goBack}
            style={styles.back}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M15 6 l-6 6 l6 6" stroke={colors.primaryText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        ) : null}
        <BrandLogo size={30} tintColor={colors.primaryText} accessibilityLabel={t('app.title')} />
        <Text style={styles.wordmark}>{t('app.title')}</Text>
      </View>

      {/* Screen title as a big left-aligned headline on white. */}
      {title ? (
        <Text style={styles.headline} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.primary,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  wordmark: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: 0.3,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 2,
  },
});
