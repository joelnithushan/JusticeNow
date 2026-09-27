/**
 * JusticeNow (mobile) — Branded splash.
 *
 * The first thing shown on a cold start: the JusticeNow mark centred on the
 * brand gradient, matching the reference design's full-bleed splash. It fades
 * in, holds briefly, then calls onDone() so the launch flow continues into
 * onboarding.
 *
 * This is a plain in-app screen (not the native splash) so it can show the mark
 * on the gradient AND a tagline together. The native splash (expo-splash-screen)
 * shows the emblem on white first, then this hands off to the branded gradient.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/theme';

const HOLD_MS = 1800;

// The FULL brand logo — pillar + "JusticeNow" wordmark — the same asset the native
// launch screen uses, so the two splashes are one continuous white screen.
const LOGO = require('../assets/splash-icon.png');

export default function BrandSplash({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    const timer = setTimeout(onDone, HOLD_MS);
    return () => clearTimeout(timer);
  }, [fade, onDone]);

  // White splash showing the exact full logo (pillar + wordmark) centred, matching
  // the native launch screen so there is no visual jump between the two.
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Animated.View style={[styles.content, { opacity: fade }]}>
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={t('app.title')}
        />
      </Animated.View>
      <Text style={[styles.footer, { bottom: insets.bottom + 24 }]}>
        {t('splash.footer')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.background, // white
  },
  content: { alignItems: 'center' },
  logo: { width: 260, height: 260 },
  footer: {
    position: 'absolute',
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
