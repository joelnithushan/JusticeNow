/**
 * JusticeNow (mobile) — 404 / unknown-route screen (expo-router).
 *
 * expo-router renders this for any path that does not match a route file. It
 * offers a single safe way out: back to Home. Themed like the rest of the app.
 */

import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { styles as theme } from '../src/theme';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.h1}>{t('notFound.title')}</Text>
      <Text style={theme.paragraph}>{t('notFound.body')}</Text>

      <Link href="/" asChild>
        <Pressable style={theme.btnPrimary} accessibilityRole="button">
          <Text style={theme.btnPrimaryText}>{t('notFound.home')}</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
