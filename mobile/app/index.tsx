/**
 * JusticeNow (mobile) — Home screen.
 *
 * Ported from /client/src/pages/Home.jsx. Language switcher + the two main
 * actions (report / check status), plus a grouped menu of secondary links
 * (directory / about / staff login). This is also the "neutral" screen the
 * Quick Exit button resets to.
 *
 * Layout follows 60-30-10: neutral surface, navy primary action, and orange used
 * only as a restrained ACCENT on the "check status" button (outline + label),
 * never as a full slab — a solid-orange block the size of the primary would read
 * as a second primary and unbalance the screen.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ColorValue } from 'react-native';
import { Link, Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import LanguageSwitcher from '../components/LanguageSwitcher';
import BrandSplash from '../components/BrandSplash';
import BrandLogo from '../components/BrandLogo';
import GradientBackground from '../components/GradientBackground';
import { useOnboarding } from '../src/context/OnboardingContext';
import { usePreferences } from '../src/context/PreferencesContext';
import { colors, styles as shared } from '../src/theme';

type IconProps = { color: ColorValue; size?: number };

// Small inline line-icons (react-native-svg is already a dependency; no icon
// font is added). Monochrome — they take their colour from the caller.
function DocIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3 h8 l4 4 v14 H6 Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Line x1={9} y1={12} x2={15} y2={12} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={9} y1={16} x2={15} y2={16} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function SearchIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6} stroke={color} strokeWidth={1.8} />
      <Line x1={16} y1={16} x2={20} y2={20} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function DirectoryIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={3} stroke={color} strokeWidth={1.8} />
      <Circle cx={8.5} cy={9} r={1.4} fill={color} />
      <Circle cx={8.5} cy={15} r={1.4} fill={color} />
      <Line x1={12} y1={9} x2={17} y2={9} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={12} y1={15} x2={17} y2={15} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function ShieldIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 l7 3 v6 c0 4.5 -3 7 -7 9 c-4 -2 -7 -4.5 -7 -9 V6 Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Line x1={12} y1={11} x2={12} y2={15} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={8} r={0.6} fill={color} stroke={color} strokeWidth={1} />
    </Svg>
  );
}
function ScalesIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 v18 M7 21 h10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5 7 h14 M12 5 l7 2 M12 5 L5 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 7 l-2.5 5 h5 Z M19 7 l-2.5 5 h5 Z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}
function ChartIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={12} width={4} height={7} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Rect x={10} y={8} width={4} height={11} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Rect x={16} y={5} width={4} height={14} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
function LockIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={10} width={14} height={10} rx={2.5} stroke={color} strokeWidth={1.8} />
      <Path d="M8 10 V7.5 a4 4 0 0 1 8 0 V10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
export default function Home() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { splashSeen, markSplashSeen } = useOnboarding();
  const { hydrated, setupComplete } = usePreferences();

  // Launch flow — ONE splash: the branded BrandSplash. The native launch screen
  // is styled to the SAME brand navy (see app.json) so the pre-JS moment blends
  // seamlessly into BrandSplash rather than flashing a separate white screen.
  //   1. BrandSplash shows on cold start (also covers reading prefs from disk).
  //   2. FIRST launch → onboarding carousel → preferences (language + district).
  //   3. RETURNING launches → straight to Home with the saved language applied.
  if (!splashSeen || !hydrated) {
    return <BrandSplash onDone={markSplashSeen} />;
  }
  if (!setupComplete) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <View style={local.screen}>
      {/* Blue app-bar header: brand wordmark + the language switcher (dark variant). */}
      <View style={[local.header, { paddingTop: insets.top + 8 }]}>
        <Text style={local.headerWordmark}>{t('app.title')}</Text>
        <View style={local.headerSpacer} />
        <LanguageSwitcher onDark />
      </View>

      <ScrollView contentContainerStyle={local.page} showsVerticalScrollIndicator={false}>
        {/* Compact hero: brand seal + tagline. */}
        <View style={local.hero}>
          <View style={local.medallionShadow}>
            <View style={local.medallion}>
              <GradientBackground
                id="home-logo-medallion"
                from="#FBFDFF"
                to="#DCE9F5"
                style={local.medallionFill}
              />
              <BrandLogo size={68} accessibilityLabel={t('app.title')} />
            </View>
          </View>
          <Text style={local.tagline}>{t('app.tagline')}</Text>
        </View>

        {/* Primary actions — full-width. */}
        <Link href="/report" asChild>
          <Pressable style={local.primaryBtn} accessibilityRole="button">
            <DocIcon color={colors.primaryText} />
            <Text style={local.primaryText}>{t('home.reportCase')}</Text>
          </Pressable>
        </Link>

        {/* "Check status" — the ONE permitted orange accent (outline). */}
        <Link href="/status" asChild>
          <Pressable style={local.accentBtn} accessibilityRole="button">
            <SearchIcon color={colors.secondaryOnLight} />
            <Text style={local.accentText}>{t('home.checkStatus')}</Text>
          </Pressable>
        </Link>

        {/* Secondary destinations as a 2×2 grid of tiles. */}
        <View style={local.grid}>
          <GridTile
            href="/guidance"
            icon={<ScalesIcon color={colors.primary} size={26} />}
            label={t('guidance.menu')}
          />
          <GridTile
            href="/directory"
            icon={<DirectoryIcon color={colors.primary} size={26} />}
            label={t('home.directory')}
          />
          <GridTile
            href="/about"
            icon={<ShieldIcon color={colors.primary} size={26} />}
            label={t('home.about')}
          />
          <GridTile
            href="/transparency"
            icon={<ChartIcon color={colors.primary} size={26} />}
            label={t('transparency.menu')}
          />
        </View>

        {/* Staff login — subtle footer. */}
        <Link href="/staff/login" asChild>
          <Pressable style={local.staffBtn} accessibilityRole="button">
            <LockIcon color={colors.muted} size={16} />
            <Text style={local.staffText}>{t('home.staffLogin')}</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </View>
  );
}

// One tile in the 2×2 feature grid: icon in a tinted square + label. Column
// layout (RN default) so the Link-cloned Pressable renders reliably.
function GridTile({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable style={local.tile} accessibilityRole="button" accessibilityLabel={label}>
        <View style={local.tileIcon}>{icon}</View>
        <Text style={local.tileLabel}>{label}</Text>
      </Pressable>
    </Link>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // Blue app-bar header (extends up behind the status bar via the top inset).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.primary,
  },
  headerWordmark: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: 0.3,
  },
  headerSpacer: { flex: 1 },

  page: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    backgroundColor: colors.background,
  },

  hero: { alignItems: 'center', marginTop: 4, marginBottom: 18 },
  // Raised medallion around the seal. Shadow lives here (no overflow clip).
  medallionShadow: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#0A3559',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  // Clipped circle: holds the domed gradient + the seal, with a thin light ring.
  medallion: {
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(10,53,89,0.10)',
  },
  medallionFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tagline: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 21,
    paddingHorizontal: 8,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
    // subtle depth
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: '700' },

  accentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.secondaryTint,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 12,
  },
  accentText: { color: colors.secondaryOnLight, fontSize: 17, fontWeight: '700' },

  // 2×2 feature grid.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  tile: {
    width: '48%',
    minHeight: 108,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
    marginBottom: 10,
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Subtle staff-login footer.
  staffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 4,
  },
  staffText: { fontSize: 15, fontWeight: '600', color: colors.muted },
});
