/**
 * JusticeNow (mobile) — Neutral cover screen shown after Quick Exit.
 *
 * This is the mobile counterpart of the web QuickExitScreen. When the reporter
 * taps Quick Exit she lands here. It must reveal NOTHING about JusticeNow to
 * anyone glancing at the phone: no logo, no app name, no "you have exited"
 * message. It reads as an ordinary clock screen — the kind of thing a phone
 * shows when idle.
 *
 * The only way back is a small, unlabelled dot for the person who tapped Exit
 * by mistake. It carries a neutral accessible name only ("go back") and does
 * not name or hint at the app it returns to.
 *
 * NOTE: the Quick Exit button navigates here with router.replace, so the
 * previous (report) screen is dropped from the stack and hardware Back cannot
 * restore it. This screen holds no case data.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function QuickExitScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A live clock makes the cover look like a normal idle screen rather than a
  // blank one (which could itself look broken and draw attention). It only
  // updates the text, so there is no animation to worry about.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={styles.screen}>
      {/* Dark status-bar icons read against the plain white cover. */}
      <StatusBar style="dark" />

      <View style={styles.clock}>
        <Text style={styles.time}>{time}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>

      {/* Discreet return: a faint dot with only a neutral accessible name. It
          goes to the app home; nothing here identifies what it returns to. */}
      <Pressable
        onPress={() => router.replace('/')}
        style={[styles.return, { bottom: insets.bottom + 20 }]}
        accessibilityRole="button"
        accessibilityLabel={t('quickExit.back')}
        hitSlop={16}
      >
        <Text style={styles.returnDot}>·</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clock: {
    alignItems: 'center',
  },
  time: {
    fontSize: 64,
    fontWeight: '300',
    color: '#1f2937',
  },
  date: {
    marginTop: 8,
    fontSize: 16,
    color: '#6b7280',
  },
  return: {
    position: 'absolute',
    alignSelf: 'center',
    minWidth: 44, // full 44×44 touch target, even though it looks like a dot
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnDot: {
    color: '#d1d5db',
    fontSize: 28,
    lineHeight: 30,
  },
});
