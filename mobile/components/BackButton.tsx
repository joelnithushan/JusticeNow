/**
 * JusticeNow (mobile) — Back button (arrow + label).
 *
 * A user-friendly back affordance: a real left-arrow icon next to the label,
 * rather than a text link that reads like a hyperlink. Used on staff sub-pages
 * that push onto the stack (case detail, admin editors, audit).
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../src/theme';

export default function BackButton({
  onPress,
  label,
  color = colors.primary,
}: {
  onPress: () => void;
  label: string;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.btn}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M15 5 L8 12 L15 19"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  text: { fontSize: 16, fontWeight: '700' },
});
