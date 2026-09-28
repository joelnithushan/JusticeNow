/**
 * DefaultAvatar — the neutral "no photo yet" profile picture.
 *
 * Shown for every staffer who has not uploaded their own avatar, so the UI never
 * has an empty avatar slot. It is a pure display fallback: nothing is written to
 * the database. As soon as a staffer uploads a photo (POST /api/staff/me/avatar)
 * the real avatar_url takes over everywhere.
 *
 * A generic grey person silhouette on a light grey disc — role-agnostic and the
 * universally-understood "no picture" look, matching most apps.
 */

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

// Neutral cool-greys, kept local: this is deliberately OFF-brand (a placeholder
// should read as "empty", not as a themed element), so it does not use the navy
// palette in src/theme.ts.
const DISC = '#E9EDF0'; // light grey background disc
const FIGURE = '#94A3AD'; // mid grey silhouette

interface DefaultAvatarProps {
  /** Rendered width/height in px (the avatar is always a circle). */
  size?: number;
}

/** A generic grey person silhouette used until the staffer uploads a photo. */
export default function DefaultAvatar({ size = 96 }: DefaultAvatarProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" accessibilityRole="image">
      <Circle cx={48} cy={48} r={48} fill={DISC} />
      {/* Head */}
      <Circle cx={48} cy={38} r={16} fill={FIGURE} />
      {/* Shoulders — a rounded cap clipped by the disc via the viewBox. */}
      <Path d="M20 82c0-15.5 12.5-26 28-26s28 10.5 28 26v6H20z" fill={FIGURE} />
    </Svg>
  );
}
