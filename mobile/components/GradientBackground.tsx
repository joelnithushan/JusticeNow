/**
 * JusticeNow (mobile) — Reusable gradient fill.
 *
 * Draws a linear gradient that fills its parent, with any children rendered on
 * top. Used for the splash background, the preferences header, and the circular
 * illustration "blob" on onboarding — so the brand's navy→teal gradient is
 * declared in ONE place instead of being re-approximated per screen.
 *
 * We render the gradient with react-native-svg (already a dependency) rather
 * than pulling in expo-linear-gradient, so no native rebuild is needed. Each
 * instance takes a unique `id` because SVG gradient ids can otherwise collide
 * when two gradients render on the same screen.
 */

import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../src/theme';

type Props = {
  id: string;
  /** Two-stop colours, top-left → bottom-right. Defaults to the brand gradient. */
  from?: string;
  to?: string;
  /** false → vertical (top→bottom); true (default) → diagonal, like the design. */
  diagonal?: boolean;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
};

export default function GradientBackground({
  id,
  from = colors.gradientTop,
  to = colors.gradientBottom,
  diagonal = true,
  style,
  children,
}: Props) {
  const end = diagonal ? { x2: '1', y2: '1' } : { x2: '0', y2: '1' };

  // Measure the container in real pixels instead of relying on the SVG's
  // width/height="100%". WHY: when the container is CONTENT-sized (e.g. a header
  // whose height comes from its children — mark + title + subtitle), an
  // absolutely-positioned SVG with percentage dimensions measures before the
  // flow height is known and paints only a partial area. The gradient then
  // covers just the top, and any text below it lands on the surface behind →
  // white-on-white and invisible. Measuring gives the SVG exact dimensions that
  // always cover the full container.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  return (
    <View style={style} onLayout={onLayout}>
      {size.width > 0 && size.height > 0 && (
        <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={end.x2} y2={end.y2}>
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill={`url(#${id})`} />
        </Svg>
      )}
      {children}
    </View>
  );
}
