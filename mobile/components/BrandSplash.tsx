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
import { Animated, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import GradientBackground from './GradientBackground';
import BrandLogo from './BrandLogo';

const HOLD_MS = 1800;

export default function BrandSplash({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    const timer = setTimeout(onDone, HOLD_MS);
    return () => clearTimeout(timer);
  }, [fade, onDone]);

  return (
    <GradientBackground id="splash" style={styles.container}>
      <StatusBar style="light" />
      <Animated.View style={[styles.content, { opacity: fade }]}>
        {/* The seal already carries the "JUSTICE NOW" wordmark, so we don't repeat
            a title beneath it — just the seal badge and the tagline. */}
        <BrandLogo size={150} variant="chip" accessibilityLabel={t('app.title')} />
        <Text style={styles.tagline}>{t('splash.tagline')}</Text>
      </Animated.View>
      <Text style={[styles.footer, { bottom: insets.bottom + 24 }]}>
        {t('splash.footer')}
      </Text>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { alignItems: 'center' },
  title: {
    marginTop: 18,
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  tagline: {
    marginTop: 10,
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  footer: {
    position: 'absolute',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
