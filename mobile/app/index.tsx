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
// AI legal guidance: a chat bubble with a sparkle — signals an AI assistant.
function AIChatIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5 h16 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 H10 l-4 4 v-4 H4 a1 1 0 0 1 -1 -1 V6 a1 1 0 0 1 1 -1 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M12 7.5 l0.9 2.1 l2.1 0.9 l-2.1 0.9 l-0.9 2.1 l-0.9 -2.1 l-2.1 -0.9 l2.1 -0.9 Z"
        fill={color}
      />
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
function ChevronIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6 l6 6 l-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
      {/* Blue app-bar header: brand mark + wordmark, and the language switcher. The
          pillar mark is a single-colour PNG, so we tint it white to read on navy. */}
      <View style={[local.header, { paddingTop: insets.top + 8 }]}>
        <View style={local.headerBrand}>
          <BrandLogo size={30} tintColor={colors.primaryText} accessibilityLabel={t('app.title')} />
          <Text style={local.headerWordmark}>{t('app.title')}</Text>
        </View>
        <View style={local.headerSpacer} />
        <LanguageSwitcher onDark />
      </View>

      <ScrollView contentContainerStyle={local.page} showsVerticalScrollIndicator={false}>
        {/* Hero: left-aligned headline + tagline. */}
        <View style={local.hero}>
          <Text style={local.headline}>{t('home.headline')}</Text>
          <Text style={local.tagline}>{t('app.tagline')}</Text>
        </View>

        {/* Primary action — full-width navy slab, icon + label left, chevron right. */}
        <Link href="/report" asChild>
          <Pressable style={local.primaryBtn} accessibilityRole="button">
            <DocIcon color={colors.primaryText} />
            <Text style={local.primaryText}>{t('home.reportCase')}</Text>
            <View style={local.btnSpacer} />
            <ChevronIcon color={colors.primaryText} size={22} />
          </Pressable>
        </Link>

        {/* "Check status" — outlined navy button. */}
        <Link href="/status" asChild>
          <Pressable style={local.outlineBtn} accessibilityRole="button">
            <SearchIcon color={colors.primary} />
            <Text style={local.outlineText}>{t('home.checkStatus')}</Text>
            <View style={local.btnSpacer} />
            <ChevronIcon color={colors.primary} size={22} />
          </Pressable>
        </Link>

        {/* Explore: secondary destinations as a vertical list of rows. */}
        <Text style={local.sectionLabel}>{t('home.explore')}</Text>
        <View style={local.list}>
          <GridTile
            href="/guidance"
            icon={<AIChatIcon color={colors.primary} size={24} />}
            label={t('guidance.menu')}
          />
          <GridTile
            href="/directory"
            icon={<DirectoryIcon color={colors.primary} size={22} />}
            label={t('home.directory')}
          />
          <GridTile
            href="/about"
            icon={<ShieldIcon color={colors.primary} size={22} />}
            label={t('home.about')}
          />
          <GridTile
            href="/transparency"
            icon={<ChartIcon color={colors.primary} size={22} />}
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

// One row in the Explore list: a tinted icon square (left), the label, and a
// trailing chevron — a full-width tappable row.
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
        <ChevronIcon color={colors.muted} size={20} />
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
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    paddingTop: 28,
    paddingBottom: 32,
    backgroundColor: colors.background,
  },

  // Left-aligned hero: bold headline + supporting tagline.
  hero: { marginBottom: 26 },
  headline: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 17,
    color: colors.muted,
    lineHeight: 24,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primary,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginTop: 4,
    // subtle depth
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryText: { color: colors.primaryText, fontSize: 18, fontWeight: '700' },

  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginTop: 14,
  },
  outlineText: { color: colors.primary, fontSize: 18, fontWeight: '700' },

  // Pushes the trailing chevron to the right edge of the buttons.
  btnSpacer: { flex: 1 },

  sectionLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 30,
    marginBottom: 14,
  },

  // Vertical Explore list.
  list: {
    gap: 10,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tileIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  tileLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 21,
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
