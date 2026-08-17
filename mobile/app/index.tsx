/**
 * JusticeNow (mobile) — Home screen.
 *
 * Ported from /client/src/pages/Home.jsx. Language switcher + the two main
 * actions (report / check status), plus links to the directory and staff login.
 * This is also the "neutral" screen the Quick Exit button resets to.
 */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { styles } from '../src/theme';

export default function Home() {
  const { t } = useTranslation();

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <LanguageSwitcher />

      <Text style={styles.h1}>{t('app.title')}</Text>
      <Text style={styles.tagline}>{t('app.tagline')}</Text>
      <Text style={styles.privacyNote}>{t('home.privacyNote')}</Text>

      <View>
        <Link href="/report" asChild>
          <Pressable style={styles.btnPrimary} accessibilityRole="button">
            <Text style={styles.btnPrimaryText}>{t('home.reportCase')}</Text>
          </Pressable>
        </Link>

        <Link href="/status" asChild>
          <Pressable style={styles.btnSecondary} accessibilityRole="button">
            <Text style={styles.btnSecondaryText}>{t('home.checkStatus')}</Text>
          </Pressable>
        </Link>

        <Link href="/directory" asChild>
          <Pressable style={styles.btnLink} accessibilityRole="button">
            <Text style={styles.btnLinkText}>{t('home.directory')}</Text>
          </Pressable>
        </Link>

        <Link href="/staff/login" asChild>
          <Pressable style={styles.btnLink} accessibilityRole="button">
            <Text style={styles.btnLinkText}>{t('home.staffLogin')}</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
