/**
 * JusticeNow (mobile) — Staff login (placeholder).
 * Ported from /client/src/pages/StaffLogin.jsx.
 * NEXT SPRINT: Supabase Auth for staff. Remember: ONLY staff log in —
 * reporters never authenticate, by design.
 */

import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { styles as theme } from '../../src/theme';

export default function StaffLogin() {
  const { t } = useTranslation();

  return (
    <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.h1}>{t('staffLogin.title')}</Text>
      <Text style={theme.paragraph}>{t('common.comingSoon')}</Text>

      {/* Temporary shortcut so the team can see the reports list while auth is pending */}
      <Link href="/staff/reports" asChild>
        <Pressable style={theme.btnSecondary} accessibilityRole="button">
          <Text style={theme.btnSecondaryText}>{t('staffReports.title')}</Text>
        </Pressable>
      </Link>
      <Link href="/" asChild>
        <Pressable style={theme.btnLink} accessibilityRole="button">
          <Text style={theme.btnLinkText}>{t('common.back')}</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
