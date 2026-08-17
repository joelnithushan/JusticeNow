/**
 * JusticeNow (mobile) — Language switcher (English / Tamil / Sinhala).
 *
 * Each language is labelled in its own script so a user can find their language
 * even when the app is currently showing one they cannot read.
 *
 * The choice is applied with i18n.changeLanguage(), which keeps it in memory
 * only — we do NOT persist it (see src/i18n/index.ts for the reasoning).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'si', label: 'සිංහල' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Language">
      {LANGUAGES.map(({ code, label }) => {
        const isActive = i18n.language === code;
        return (
          <Pressable
            key={code}
            onPress={() => i18n.changeLanguage(code)}
            style={[styles.btn, isActive && styles.btnActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#0b3d5c',
  },
  btnActive: {
    backgroundColor: '#0b3d5c',
  },
  label: {
    color: '#0b3d5c',
    fontWeight: '600',
  },
  labelActive: {
    color: '#fff',
  },
});
