/**
 * JusticeNow (mobile) — Brand logo (the official "JUSTICE NOW" seal).
 *
 * ONE logo across the whole app so branding is consistent with the app icon,
 * the native splash and the web client (all of which use this same seal).
 *
 * The seal artwork is dark navy on transparent, so it is invisible on the dark
 * navy→teal gradient headers. For those, use variant="chip": the seal sits in a
 * white circular badge that reads clearly on any background. On light surfaces
 * use the default "plain" variant (the seal directly).
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const SEAL = require('../assets/brand-logo.png');

type Props = {
  /** Rendered width/height in points. */
  size?: number;
  /** "plain" for light backgrounds; "chip" wraps it in a white circle for dark ones. */
  variant?: 'plain' | 'chip';
  accessibilityLabel?: string;
};

export default function BrandLogo({ size = 64, variant = 'plain', accessibilityLabel = 'JusticeNow' }: Props) {
  if (variant === 'chip') {
    // Inner artwork is inset from the circle edge so the seal breathes inside
    // the badge rather than touching the rim.
    const pad = Math.round(size * 0.14);
    const inner = size - pad * 2;
    return (
      <View
        style={[
          styles.chip,
          { width: size, height: size, borderRadius: size / 2, padding: pad },
        ]}
      >
        <Image
          source={SEAL}
          style={{ width: inner, height: inner }}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    );
  }

  return (
    <Image
      source={SEAL}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    // 3D "raised badge" look: a deep, soft drop shadow lifts the white disc off
    // the gradient, and a faint light rim gives it a rounded, dimensional edge.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#04101d', // deep navy shadow reads richer than pure black
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
