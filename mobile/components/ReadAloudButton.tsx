/**
 * JusticeNow (mobile) — reusable on-device read-aloud control.
 *
 * WHY: many reporters have low literacy or a visual impairment. This button reads
 * the current screen's key text aloud using the DEVICE's built-in text-to-speech
 * (expo-speech) — fully on-device, so the words NEVER leave the phone (important:
 * the text can be report questions or a case status). No network, no API key, no
 * cost, and it works offline.
 *
 * Callers pass `getText` (a getter, so the text reflects live screen state at the
 * moment of tapping) and optionally a `lang` override. Speech always stops on
 * unmount so nothing keeps reading after the user navigates away or the app is
 * backgrounded.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Speech from 'expo-speech';
import { colors } from '../src/theme';

// Map i18n language codes to the OS voice locales. Keep aligned with the codes
// used across the app. Falls back to en-US if a voice is unavailable (common for
// si-LK / ta-IN on some devices) — expo-speech then uses a default voice.
const SPEECH_LOCALES: Record<string, string> = {
  en: 'en-US',
  ta: 'ta-IN',
  si: 'si-LK',
};

type Props = {
  /** Built lazily on press so it captures the latest on-screen text. */
  getText: () => string;
  /** Override the voice language; defaults to the current app language. */
  lang?: string;
  style?: StyleProp<ViewStyle>;
};

export default function ReadAloudButton({ getText, lang, style }: Props) {
  const { t, i18n } = useTranslation();
  const [speaking, setSpeaking] = useState(false);

  // Stop any in-flight speech when the button unmounts (screen change / exit).
  useEffect(
    () => () => {
      Speech.stop();
    },
    [],
  );

  const toggle = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    const text = getText().trim();
    if (!text) return;
    setSpeaking(true);
    Speech.speak(text, {
      language: SPEECH_LOCALES[lang ?? i18n.language] ?? 'en-US',
      // Reset the button on every terminal event so it never sticks on "Stop".
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const label = speaking ? t('common.stopListening') : t('common.listen');

  return (
    <Pressable
      onPress={toggle}
      style={[styles.btn, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: speaking }}
    >
      <Text style={styles.icon}>{speaking ? '■' : '▶'}</Text>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  icon: { fontSize: 14, color: colors.primary },
  text: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
