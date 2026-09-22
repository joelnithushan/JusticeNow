/**
 * JusticeNow (mobile) — Shown once after a successful submission.
 *
 * Ported from /client/src/pages/ReportSuccess.jsx. Displays the reference code
 * prominently. The code arrives via route params (in memory only — never
 * persisted). If someone lands here without a code, redirect home rather than
 * showing a broken page. This is intentional: we never store the code on the
 * device.
 */

import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
// expo-media-library is a native module — not available in standard Expo Go.
// We load it lazily so a missing native module does not crash the whole screen.
let MediaLibrary: typeof import('expo-media-library') | null = null;
try { MediaLibrary = require('expo-media-library'); } catch { MediaLibrary = null; }
// The classic file API (cacheDirectory / writeAsStringAsync) lives under /legacy
// in expo-file-system v57.
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Path } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import ReporterTopBar from '../../components/ReporterTopBar';
import { colors, styles as theme } from '../../src/theme';

// A small download / save-to-photos glyph.
function DownloadIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3 v12 M8 11 l4 4 l4 -4 M5 21 h14"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// A small left-arrow for the subtle "Back to home" control.
function BackArrow({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5 L8 12 L15 19"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ReportSuccess() {
  const { t } = useTranslation();
  const { referenceCode } = useLocalSearchParams<{ referenceCode?: string }>();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  // Ref to the QRCode so we can export it as a PNG to save to the gallery.
  const qrRef = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(null);

  if (!referenceCode) {
    return <Redirect href="/" />;
  }

  // Tap the code card to copy it to the clipboard. This is a convenience only —
  // the code still lives just in memory (route params); we do not persist it.
  const copyCode = async () => {
    await Clipboard.setStringAsync(referenceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Save the QR as a PNG to the photo gallery. The reporter chose to keep their
  // code as an image; the QR encodes only the reference code (already on screen).
  const saveQr = async () => {
    if (saving || !qrRef.current) return;
    if (!MediaLibrary) {
      Alert.alert('Not available', 'Saving to gallery requires a full build of the app.');
      return;
    }
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('success.qrSaveTitle'), t('success.qrPermission'));
        return;
      }
      // QRCode.toDataURL returns raw base64 (no data-URI prefix).
      const base64: string = await new Promise((resolve) =>
        qrRef.current!.toDataURL((data) => resolve(data)),
      );
      const fileUri = `${FileSystem.cacheDirectory}justicenow-${referenceCode}.png`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await MediaLibrary.saveToLibraryAsync(fileUri);
      Alert.alert(t('success.qrSaveTitle'), t('success.qrSaved'));
    } catch {
      // Never log — nothing sensitive should reach logs.
      Alert.alert(t('success.qrSaveTitle'), t('success.qrSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ReporterTopBar title={t('success.title')} showBack={false} />
      <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.privacyNoteSmall}>{t('success.yourCode')}</Text>
      {/* The reference-code card is the ONE permitted solid-orange element on this
          screen (10% accent). Text on #F18501 MUST be on-secondary #3D2200 —
          white/light on orange fails WCAG AA. Tapping the card copies the code. */}
      <Pressable
        onPress={copyCode}
        accessibilityRole="button"
        accessibilityLabel={referenceCode}
        accessibilityHint={t('success.tapToCopy')}
        style={{ backgroundColor: colors.secondary, borderRadius: 8, padding: 16 }}
      >
        <Text
          selectable
          style={{ fontSize: 28, fontWeight: '800', letterSpacing: 2, color: colors.onSecondary, textAlign: 'center' }}
        >
          {referenceCode}
        </Text>
      </Pressable>
      <Text
        style={{ fontSize: 13, color: copied ? colors.primary : colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 16, fontWeight: copied ? '700' : '400' }}
        accessibilityLiveRegion="polite"
      >
        {copied ? t('success.copied') : t('success.tapToCopy')}
      </Text>

      {/* QR of the reference code — an easy way to save/screenshot the code
          instead of copying it by hand. It encodes ONLY the code (nothing that is
          not already on this screen), so it leaks nothing extra. Rendered with
          react-native-svg, navy on white for reliable scanning. */}
      <View style={local.qrCard}>
        <QRCode
          value={referenceCode}
          size={148}
          color={colors.primary}
          backgroundColor="#ffffff"
          getRef={(c) => {
            qrRef.current = c;
          }}
        />
        <View style={local.qrCaptionRow}>
          <Text style={local.qrCaption}>{t('success.qrHint')}</Text>
          <Pressable
            onPress={saveQr}
            disabled={saving}
            style={[local.saveQrIcon, saving && { opacity: 0.5 }]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('success.qrSave')}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <DownloadIcon color={colors.primary} />
            )}
          </Pressable>
        </View>
      </View>

      <Text style={[theme.paragraph, { fontWeight: '700' }]}>{t('success.writeItDown')}</Text>
      <Text style={theme.paragraph}>{t('success.explanation')}</Text>

      {/* Primary action: checking the case is what matters most here. */}
      <Link href="/status" asChild>
        <Pressable style={theme.btnPrimary} accessibilityRole="button">
          <Text style={theme.btnPrimaryText}>{t('success.checkStatusButton')}</Text>
        </Pressable>
      </Link>
      {/* Secondary, de-emphasised: a subtle arrow link back home. */}
      <Link href="/" asChild>
        <Pressable style={local.homeBtn} accessibilityRole="button">
          <BackArrow color={colors.muted} />
          <Text style={local.homeBtnText}>{t('success.backHome')}</Text>
        </Pressable>
      </Link>
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  // Centred QR card in a light tinted panel.
  qrCard: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primaryTint,
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
  },
  // Caption + a small download icon (subtle, not a big button).
  qrCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
  },
  qrCaption: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  saveQrIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  // Subtle, de-emphasised "Back to home" — a muted arrow + label, no border, so
  // it never competes with the primary "Check case status" button above it.
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
  },
  homeBtnText: { fontSize: 15, fontWeight: '600', color: colors.muted },
});
