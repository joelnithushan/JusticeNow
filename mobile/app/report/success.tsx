/**
 * JusticeNow (mobile) — Shown once after a successful submission.
 *
 * Ported from /client/src/pages/ReportSuccess.jsx. Displays the reference code
 * prominently. The code arrives via route params (in memory only — never
 * persisted). If someone lands here without a code, redirect home rather than
 * showing a broken page. This is intentional: we never store the code on the
 * device.
 */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, styles as theme } from '../../src/theme';

export default function ReportSuccess() {
  const { t } = useTranslation();
  const { referenceCode } = useLocalSearchParams<{ referenceCode?: string }>();

  if (!referenceCode) {
    return <Redirect href="/" />;
  }

  return (
    <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.h1}>{t('success.title')}</Text>

      <Text style={theme.privacyNoteSmall}>{t('success.yourCode')}</Text>
      <View style={{ backgroundColor: colors.secondary, borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <Text
          selectable
          style={{ fontSize: 28, fontWeight: '800', letterSpacing: 2, color: colors.primary, textAlign: 'center' }}
        >
          {referenceCode}
        </Text>
      </View>

      <Text style={[theme.paragraph, { fontWeight: '700' }]}>{t('success.writeItDown')}</Text>
      <Text style={theme.paragraph}>{t('success.explanation')}</Text>

      <Link href="/status" asChild>
        <Pressable style={theme.btnSecondary} accessibilityRole="button">
          <Text style={theme.btnSecondaryText}>{t('success.checkStatusButton')}</Text>
        </Pressable>
      </Link>
      <Link href="/" asChild>
        <Pressable style={theme.btnLink} accessibilityRole="button">
          <Text style={theme.btnLinkText}>{t('success.backHome')}</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
