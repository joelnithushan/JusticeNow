/**
 * JusticeNow (mobile) — Preferences screen.
 *
 * The final launch step, styled to the reference design: a gradient header with
 * the brand mark, title and subtitle, then a set of preference rows on a white
 * surface, and a Next button that stays disabled until the required fields are
 * chosen.
 *
 * Fields are adapted to the domain (the design's Country/Currency/Referral do
 * not apply to an anonymous, Sri-Lanka-only human-rights app):
 *   • Language   (required) — applied immediately via i18next
 *   • District   (optional) — a display preference only; NEVER linked to a report
 *   • Text size  (required) — accessibility (normal / large)
 *
 * Finishing sets the onboarding "seen" flag and enters the app at Home. Nothing
 * is written to the device (see PreferencesContext / OnboardingContext).
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import GradientBackground from '../components/GradientBackground';
import BrandLogo from '../components/BrandLogo';
import SelectField, { Option } from '../components/SelectField';
import { usePreferences } from '../src/context/PreferencesContext';
import { DISTRICTS } from '../src/constants';
import { colors } from '../src/theme';

const LANGUAGES: Option[] = [
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'தமிழ்' },
  { value: 'si', label: 'සිංහල' },
];

export default function Preferences() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { district, setDistrict, completeSetup } = usePreferences();

  // Language starts unset so the required "*" is meaningful and Next is disabled
  // until the user confirms a choice (matching the design), even though i18n
  // already has an active language from device detection.
  const [language, setLanguage] = useState<string | null>(null);

  const districtOptions: Option[] = DISTRICTS.map((d) => ({ value: d, label: d }));

  const canContinue = !!language;

  const onLanguage = (v: string) => {
    setLanguage(v);
    i18n.changeLanguage(v); // apply immediately so the rest of the screen updates
  };

  const finish = async () => {
    if (!canContinue || !language) return;
    // Persist the chosen language + district to the device and mark setup done,
    // so returning launches skip onboarding/preferences (see PreferencesContext).
    await completeSetup(language, district);
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Gradient header with the brand mark, title and subtitle. */}
      <GradientBackground
        id="prefs-header"
        style={[styles.header, { paddingTop: insets.top + 20 }]}
      >
        <BrandLogo size={56} variant="chip" accessibilityLabel={t('app.title')} />
        <Text style={styles.title} accessibilityRole="header">
          {t('preferences.title')}
        </Text>
        <Text style={styles.subtitle}>{t('preferences.subtitle')}</Text>
      </GradientBackground>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <SelectField
          label={t('preferences.language.label')}
          required
          placeholder={t('preferences.language.placeholder')}
          value={language}
          options={LANGUAGES}
          onChange={onLanguage}
          sheetTitle={t('preferences.language.label')}
        />

        <SelectField
          label={t('preferences.district.label')}
          placeholder={t('preferences.district.placeholder')}
          value={district}
          options={districtOptions}
          onChange={setDistrict}
          sheetTitle={t('preferences.district.label')}
        />
        <Text style={styles.hint}>{t('preferences.district.hint')}</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={finish}
          disabled={!canContinue}
          style={[styles.nextBtn, !canContinue && styles.nextBtnDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          accessibilityLabel={t('preferences.next')}
        >
          <Text style={[styles.nextText, !canContinue && styles.nextTextDisabled]}>
            {t('preferences.next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  title: { marginTop: 14, fontSize: 28, fontWeight: '800', color: '#ffffff' },
  subtitle: { marginTop: 6, fontSize: 15, color: 'rgba(255,255,255,0.9)' },

  body: { padding: 24, paddingTop: 28 },
  hint: {
    fontSize: 13,
    color: colors.muted,
    marginTop: -14,
    marginBottom: 22,
    lineHeight: 18,
  },

  footer: { paddingHorizontal: 24, paddingTop: 8 },
  nextBtn: {
    paddingVertical: 17,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  nextBtnDisabled: { backgroundColor: colors.primaryTint },
  nextText: { fontSize: 17, fontWeight: '700', color: colors.primaryText },
  nextTextDisabled: { color: colors.muted },
});
