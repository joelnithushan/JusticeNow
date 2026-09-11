/**
 * JusticeNow (mobile) — Reusable error / offline block.
 *
 * A centred glyph + message, with an optional Retry button. Used wherever a
 * screen's data load fails or the device is offline, so every screen surfaces
 * failures the same way instead of re-inventing an error view each time.
 *
 * Keep messages generic and safe: never render server/case details here (see
 * CLAUDE.md — never log or expose case data).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors, styles as theme } from '../src/theme';

type Props = { message: string; onRetry?: () => void };

// Simple monochrome "warning triangle" glyph (react-native-svg — no new deps).
function WarningGlyph({ color }: { color: string }) {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3 L22 20 L2 20 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={12} y1={9} x2={12} y2={14} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={12} y1={17} x2={12} y2={17} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export default function ErrorState({ message, onRetry }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Decorative; the message text below carries the meaning. */}
      <WarningGlyph color={colors.danger} />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={[theme.btnSecondary, styles.retryButton]}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          <Text style={theme.btnSecondaryText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    textAlign: 'center',
  },
  retryButton: {
    alignSelf: 'stretch',
    maxWidth: 260,
  },
});
