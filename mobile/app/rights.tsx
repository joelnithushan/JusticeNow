/**
 * JusticeNow (mobile) — Know your rights & get help (OFFLINE).
 *
 * A calm, read-only safety screen for reporters that works with NO internet:
 *   1. Emergency help — national hotlines, tap-to-call (tel: links).
 *   2. What to do now — short, plain-language scenario guides.
 *   3. Your basic rights — a reassuring rights callout.
 *
 * WHY OFFLINE (deliberate): reporters may be in low-connectivity areas, on a
 * dying battery, or in a moment of danger where waiting on a network round-trip
 * is unacceptable. Every string here is STATIC via t() — the screen fetches
 * nothing, stores nothing, and logs nothing, so it renders instantly and leaks
 * no trace of what the reporter read.
 *
 * PRIVACY / ANONYMITY (see CLAUDE.md): this is a reporter screen — no auth, no
 * account, no case data. Placing a call uses the OS dialer; JusticeNow never
 * sees or records the number dialled. Hotline numbers are Sri Lanka national
 * lines and are safe to ship in the bundle.
 *
 * This is a reporter screen, so it wears the shared ReporterTopBar (Back).
 * All strings go through t(); all styling comes from theme tokens.
 */

import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import ReporterTopBar from '../components/ReporterTopBar';
import ReadAloudButton from '../components/ReadAloudButton';
import { colors, styles as theme } from '../src/theme';

// National Sri Lanka hotlines. The number is language-independent; only the
// human label is translated (rights.hl.<key>). Kept in ONE place so the list
// cannot drift. These are free, well-known public lines — safe to bundle.
const HOTLINES: { key: string; number: string }[] = [
  { key: 'police', number: '119' },
  { key: 'ambulance', number: '1990' },
  { key: 'hrcsl', number: '1996' },
  { key: 'women', number: '1938' },
  { key: 'child', number: '1929' },
];

// Scenario guides — each is a title + fixed number of steps. Rendered from keys
// so translators fill rights.s<N>Title / rights.s<N>a..c in every language.
const SCENARIOS = ['s1', 's2', 's3'] as const;

function PhoneIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 3.5 h3 l1.5 4 -2 1.5 a11 11 0 0 0 5 5 l1.5 -2 4 1.5 v3 a2 2 0 0 1 -2 2 A16 16 0 0 1 4.5 5.5 a2 2 0 0 1 2 -2 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function Rights() {
  const { t } = useTranslation();

  // Open the OS dialer. We never store or log the number. A device with no
  // telephony (e.g. a tablet or the simulator) simply does nothing on tap.
  const call = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {
      /* No dialer available — silently ignore; nothing to recover or log. */
    });
  };

  return (
    <View style={local.screen}>
      <ReporterTopBar title={t('rights.title')} />

      <ScrollView contentContainerStyle={theme.page}>
        {/* Works-offline reassurance, up top so it's the first thing seen. */}
        <View style={local.offlineChip}>
          <Text style={local.offlineChipText}>{t('rights.offlineNote')}</Text>
        </View>

        {/* 1 · Emergency help — tap-to-call rows. */}
        <Text style={local.sectionTitle} accessibilityRole="header">
          {t('rights.emergencyTitle')}
        </Text>
        <Text style={local.intro}>{t('rights.emergencyIntro')}</Text>
        <View style={local.hlList}>
          {HOTLINES.map(({ key, number }) => (
            <Pressable
              key={key}
              style={local.hlRow}
              onPress={() => call(number)}
              accessibilityRole="button"
              accessibilityLabel={`${t('rights.callLabel')} ${t(`rights.hl.${key}`)} ${number}`}
            >
              <View style={local.hlIcon}>
                <PhoneIcon color={colors.primaryText} size={20} />
              </View>
              <View style={local.hlText}>
                <Text style={local.hlName}>{t(`rights.hl.${key}`)}</Text>
                <Text style={local.hlNumber}>{number}</Text>
              </View>
              <Text style={local.hlCall}>{t('rights.callLabel')}</Text>
            </Pressable>
          ))}
        </View>

        {/* 2 · What to do now — scenario cards, each a title + 3 steps. */}
        <Text style={local.sectionTitle} accessibilityRole="header">
          {t('rights.scenariosTitle')}
        </Text>
        {SCENARIOS.map((s) => (
          <View key={s} style={local.card}>
            <Text style={local.cardTitle} accessibilityRole="header">
              {t(`rights.${s}Title`)}
            </Text>
            {(['a', 'b', 'c'] as const).map((step) => (
              <Text key={step} style={local.cardStep}>
                {`• ${t(`rights.${s}${step}`)}`}
              </Text>
            ))}
            <ReadAloudButton
              style={local.readAloud}
              getText={() =>
                [
                  t(`rights.${s}Title`),
                  t(`rights.${s}a`),
                  t(`rights.${s}b`),
                  t(`rights.${s}c`),
                ].join('. ')
              }
            />
          </View>
        ))}

        {/* 3 · Your basic rights — reassuring callout. */}
        <View style={local.callout}>
          <Text style={local.calloutTitle} accessibilityRole="header">
            {t('rights.rightsTitle')}
          </Text>
          <Text style={local.calloutBody}>{`• ${t('rights.right1')}`}</Text>
          <Text style={local.calloutBody}>{`• ${t('rights.right2')}`}</Text>
          <Text style={local.calloutBody}>{`• ${t('rights.right3')}`}</Text>
          <Text style={local.calloutBody}>{`• ${t('rights.right4')}`}</Text>
          <ReadAloudButton
            style={local.readAloud}
            getText={() =>
              [
                t('rights.rightsTitle'),
                t('rights.right1'),
                t('rights.right2'),
                t('rights.right3'),
                t('rights.right4'),
              ].join('. ')
            }
          />
        </View>

        <Text style={local.footer}>{t('rights.footer')}</Text>
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  offlineChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTint,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 18,
  },
  offlineChipText: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 0.3 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
    marginBottom: 6,
  },
  intro: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 12 },

  // Emergency hotline rows — navy phone square, name + big number, "Call".
  hlList: { gap: 10, marginBottom: 8 },
  hlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.background,
  },
  hlIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  hlText: { flex: 1 },
  hlName: { fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 20 },
  hlNumber: { fontSize: 15, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  hlCall: { fontSize: 14, fontWeight: '800', color: colors.primary },

  // Scenario cards.
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 },
  cardStep: { fontSize: 15, lineHeight: 22, color: colors.text },

  // Rights callout (tinted, like about.tsx).
  callout: {
    backgroundColor: colors.primaryTint,
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
  },
  calloutTitle: { fontSize: 16, fontWeight: '800', color: colors.primary, marginBottom: 8 },
  calloutBody: { fontSize: 15, lineHeight: 22, color: colors.text },

  readAloud: { alignSelf: 'flex-start', marginTop: 12 },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
});
