/**
 * JusticeNow (mobile) — Shown once after a successful submission.
 *
 * Ported from /client/src/pages/ReportSuccess.jsx. Displays the reference code
 * prominently. The code arrives via route params (in memory only — never
 * persisted). If someone lands here without a code, redirect home rather than
 * showing a broken page. This is intentional: we never store the code on the
 * device.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import ReporterTopBar from '../../components/ReporterTopBar';
import { colors, styles as theme } from '../../src/theme';

// A small left-arrow for the subtle "Back to home" control.
function BackArrow({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5 L8 12 L15 19"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ReportSuccess() {
  const { t } = useTranslation();
  const { referenceCode } = useLocalSearchParams<{ referenceCode?: string }>();
  const [copied, setCopied] = useState(false);

  if (!referenceCode) {
    return <Redirect href="/" />;
  }

  // Tap the code card to copy it to the clipboard. This is a convenience only —
  // the code still lives just in memory (route params); we do not persist it.
  const copyCode = async () => {
    await Clipboard.setStringAsync(referenceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ReporterTopBar title={t('success.title')} showBack={false} />
      <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.privacyNoteSmall}>{t('success.yourCode')}</Text>
      {/* The reference-code card is the ONE permitted solid-orange element on this
          screen (10% accent). Text on #F18501 MUST be on-secondary #3D2200 —
          white/light on orange fails WCAG AA. Tapping the card copies the code. */}
      <Pressable
        onPress={copyCode}
        accessibilityRole="button"
        accessibilityLabel={referenceCode}
        accessibilityHint={t('success.tapToCopy')}
        style={{ backgroundColor: colors.secondary, borderRadius: 8, padding: 16 }}
      >
        <Text
          selectable
          style={{ fontSize: 28, fontWeight: '800', letterSpacing: 2, color: colors.onSecondary, textAlign: 'center' }}
        >
          {referenceCode}
        </Text>
      </Pressable>
      <Text
        style={{ fontSize: 13, color: copied ? colors.primary : colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 16, fontWeight: copied ? '700' : '400' }}
        accessibilityLiveRegion="polite"
      >
        {copied ? t('success.copied') : t('success.tapToCopy')}
      </Text>

      {/* QR of the reference code — an easy way to save/screenshot the code
          instead of copying it by hand. It encodes ONLY the code (nothing that is
          not already on this screen), so it leaks nothing extra. Rendered with
          react-native-svg, navy on white for reliable scanning. */}
      <View style={local.qrCard}>
        <QRCode
          value={referenceCode}
          size={148}
          color={colors.primary}
          backgroundColor="#ffffff"
        />
        <Text style={local.qrCaption}>{t('success.qrHint')}</Text>
      </View>

      <Text style={[theme.paragraph, { fontWeight: '700' }]}>{t('success.writeItDown')}</Text>
      <Text style={theme.paragraph}>{t('success.explanation')}</Text>

      {/* Primary action: checking the case is what matters most here. */}
      <Link href="/status" asChild>
        <Pressable style={theme.btnPrimary} accessibilityRole="button">
          <Text style={theme.btnPrimaryText}>{t('success.checkStatusButton')}</Text>
        </Pressable>
      </Link>
      {/* Secondary, de-emphasised: a subtle arrow link back home. */}
      <Link href="/" asChild>
        <Pressable style={local.homeBtn} accessibilityRole="button">
          <BackArrow color={colors.muted} />
          <Text style={local.homeBtnText}>{t('success.backHome')}</Text>
        </Pressable>
      </Link>
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  // Centred QR card in a light tinted panel.
  qrCard: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primaryTint,
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
  },
  qrCaption: {
    marginTop: 12,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Subtle, de-emphasised "Back to home" — a muted arrow + label, no border, so
  // it never competes with the primary "Check case status" button above it.
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
  },
  homeBtnText: { fontSize: 15, fontWeight: '600', color: colors.muted },
});
