/**
 * JusticeNow (mobile) — Check case status (placeholder).
 * Ported from /client/src/pages/CheckStatus.jsx.
 * NEXT SPRINT: enter a reference code -> see status + timeline of
 * reporter-visible notes.
 */

import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { styles as theme } from '../src/theme';

export default function CheckStatus() {
  const { t } = useTranslation();

  return (
    <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.h1}>{t('status.title')}</Text>
      <Text style={theme.paragraph}>{t('common.comingSoon')}</Text>
      <Link href="/" asChild>
        <Pressable style={theme.btnLink} accessibilityRole="button">
          <Text style={theme.btnLinkText}>{t('common.back')}</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
