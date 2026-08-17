/**
 * JusticeNow (mobile) — Legal resource directory (placeholder).
 * Ported from /client/src/pages/Directory.jsx.
 * NEXT SPRINT: browse legal aid organisations by district and case type.
 */

import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { styles as theme } from '../src/theme';

export default function Directory() {
  const { t } = useTranslation();

  return (
    <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.h1}>{t('directory.title')}</Text>
      <Text style={theme.paragraph}>{t('common.comingSoon')}</Text>
      <Link href="/" asChild>
        <Pressable style={theme.btnLink} accessibilityRole="button">
          <Text style={theme.btnLinkText}>{t('common.back')}</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
