/**
 * JusticeNow (mobile) — Eye / eye-off icon for password show-hide toggles.
 *
 * Drawn with react-native-svg (already a dependency) so we add no icon-font
 * library. `crossed` shows the struck-through "hide" variant.
 */

import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

type Props = { crossed?: boolean; color?: string; size?: number };

export default function EyeIcon({ crossed = false, color = '#000000', size = 22 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      {crossed && (
        <Line x1={4} y1={4} x2={20} y2={20} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      )}
    </Svg>
  );
}
