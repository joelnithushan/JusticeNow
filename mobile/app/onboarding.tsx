/**
 * JusticeNow (mobile) — Onboarding carousel (3 slides).
 *
 * Restyled to the reference design: the brand mark at the top, a large
 * illustration sitting inside a soft gradient "blob" with floating accents, a
 * big heading + supporting line, and a footer of Skip · dots · Next. The final
 * slide's button reads "Get started" and hands off to the preferences screen.
 *
 * Slides carry the app's core promises (domain-appropriate, no faces / nothing
 * depicting violence):
 *   1 · anonymity  "You stay anonymous"
 *   2 · reporting  "Report safely in minutes"
 *   3 · safety     "Leave instantly, any time"
 *
 * Language is NOT chosen here anymore — it moved to the preferences screen, to
 * match the design. Nothing is written to the device: the flow is in-memory
 * (see OnboardingContext) and replays on a cold start.
 */

import React, { useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import GradientBackground from '../components/GradientBackground';
import BrandLogo from '../components/BrandLogo';
import { AnonDocArt, ShieldArt, DoorArt } from '../components/OnboardingArt';
import { colors } from '../src/theme';

const { width: SCREEN_W } = Dimensions.get('window');

type Slide = {
  key: string;
  Art: React.ComponentType<{ width?: number; height?: number }>;
};

const SLIDES: Slide[] = [
  { key: 'anonymity', Art: AnonDocArt },
  { key: 'reporting', Art: ShieldArt },
  { key: 'safety', Art: DoorArt },
];

export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  // Preferences is the next step in the launch flow; "seen" is not set until the
  // user finishes there, so re-entry replays from onboarding.
  const goToPreferences = () => router.replace('/preferences');

  const goTo = (i: number) => {
    scroller.current?.scrollTo({ x: i * SCREEN_W, animated: true });
    setIndex(i);
  };
  const next = () => (isLast ? goToPreferences() : goTo(index + 1));

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== index) setIndex(i);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />

      {/* Brand mark, centred at the top (navy on the off-white surface). */}
      <View style={styles.brandRow}>
        <BrandLogo size={52} accessibilityLabel={t('app.title')} />
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        {SLIDES.map(({ key, Art }) => (
          <View key={key} style={[styles.slide, { width: SCREEN_W }]}>
            {/* Illustration blob: soft gradient circle + floating accents. */}
            <View style={styles.blobWrap}>
              <GradientBackground
                id={`blob-${key}`}
                from="#EAF2FA"
                to="#D3E4F2"
                style={styles.blob}
              />
              <View style={[styles.accent, styles.accentTL]} />
              <View style={[styles.accent, styles.accentTR]} />
              <View style={[styles.accent, styles.accentBL]} />
              <View style={[styles.accent, styles.accentBR]} />
              <Art width={200} height={200} />
            </View>

            <Text style={styles.heading}>{t(`onboarding.${key}.heading`)}</Text>
            <Text style={styles.sub}>{t(`onboarding.${key}.body`)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Footer: Skip · dots · Next/Get started */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={goToPreferences}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skip')}
        >
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </Pressable>

        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <Pressable
          onPress={next}
          style={styles.nextBtn}
          accessibilityRole="button"
          accessibilityLabel={
            isLast ? t('onboarding.getStarted') : t('onboarding.continue')
          }
        >
          <Text style={styles.nextText}>
            {isLast ? t('onboarding.getStarted') : t('onboarding.continue')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const BLOB = 300;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F5' },
  brandRow: { alignItems: 'center', marginBottom: 4 },

  pager: { flex: 1 },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },

  blobWrap: {
    width: BLOB,
    height: BLOB,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  blob: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BLOB / 2,
    overflow: 'hidden',
  },
  // Floating rounded squares, echoing the reference design's scattered accents.
  accent: { position: 'absolute', borderRadius: 8 },
  accentTL: {
    top: 30,
    left: 18,
    width: 26,
    height: 26,
    backgroundColor: colors.gradientTop,
    opacity: 0.9,
  },
  // One warm accent to echo the illustrations' orange highlight (the "10").
  accentTR: {
    top: 54,
    right: 8,
    width: 18,
    height: 18,
    backgroundColor: colors.secondary,
    opacity: 0.9,
  },
  accentBL: {
    bottom: 44,
    left: 6,
    width: 20,
    height: 20,
    backgroundColor: colors.primary,
    opacity: 0.6,
  },
  accentBR: {
    bottom: 26,
    right: 22,
    width: 30,
    height: 30,
    backgroundColor: colors.gradientTop,
    opacity: 0.85,
  },

  heading: {
    fontSize: 27,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 34,
  },
  sub: {
    fontSize: 16,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 6,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  skipBtn: {
    minWidth: 110,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  skipText: { fontSize: 16, fontWeight: '700', color: colors.text },

  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.primary },

  nextBtn: {
    minWidth: 110,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  nextText: { fontSize: 16, fontWeight: '700', color: colors.primaryText },
});
