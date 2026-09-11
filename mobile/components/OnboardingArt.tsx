/**
 * JusticeNow (mobile) — Onboarding illustrations (vector).
 *
 * Rich, layered flat-illustration scenes drawn with react-native-svg. They carry
 * the app's three promises and are intentionally ABSTRACT — no faces, nothing
 * depicting violence — so they never re-traumatise or accidentally identify
 * anyone. The heading + body carry the meaning; the art is decorative.
 *
 * Palette: the dark-blue brand (#0A3559) plus lighter SHADES of the same hue for
 * depth, soft blue tints, and the orange secondary as the single warm accent.
 * The lighter blues are illustration depth only (gradients/fills) — they are not
 * new UI theme colours, so the "dark blue only" chrome rule still holds.
 */

import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

const INK = '#0A3559'; // brand dark blue
const INK_LIGHT = '#2C6390'; // lighter shade of the SAME hue, for gradient depth
const SKY = '#CFE0EF'; // soft blue tint (redacted bars, fills)
const TINT = '#E7F0F8'; // lightest blue tint (primaryTint)
const ORANGE = '#F18501'; // secondary accent
const ORANGE_DK = '#D07500';
const WARM = '#FFF3DF'; // warm light (door glow)
const WHITE = '#ffffff';
const SW = 2.5;

type ArtProps = { width?: number; height?: number };

/**
 * Slide 1 — anonymity: an ID/report card whose identity is deliberately hidden
 * (locked avatar + redacted name bars), with a warm "protected" badge. Says
 * "you are recognised as a case, never as a person".
 */
export function AnonDocArt({ width = 200, height = 200 }: ArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 200" fill="none">
      <Defs>
        <LinearGradient id="anonCard" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={WHITE} />
          <Stop offset="1" stopColor={TINT} />
        </LinearGradient>
        <LinearGradient id="anonHeader" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={INK} />
          <Stop offset="1" stopColor={INK_LIGHT} />
        </LinearGradient>
        <LinearGradient id="anonBadge" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={ORANGE} />
          <Stop offset="1" stopColor={ORANGE_DK} />
        </LinearGradient>
      </Defs>

      {/* soft drop shadow under the card */}
      <Rect x={40} y={54} width={120} height={112} rx={18} fill={INK} opacity={0.08} />

      {/* card body */}
      <Rect x={38} y={44} width={120} height={112} rx={18} fill="url(#anonCard)" stroke={INK} strokeWidth={SW} />

      {/* header band (top corners only, matching the card radius) */}
      <Path
        d="M38 62 a18 18 0 0 1 18 -18 h84 a18 18 0 0 1 18 18 V72 H38 Z"
        fill="url(#anonHeader)"
      />

      {/* locked avatar — identity hidden, not a face */}
      <Circle cx={64} cy={100} r={17} fill={INK} />
      <Path d="M58 98 v-3 a6 6 0 0 1 12 0 v3" fill="none" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" />
      <Rect x={56} y={98} width={16} height={13} rx={2.5} fill={WHITE} />
      <Circle cx={64} cy={104} r={1.8} fill={INK} />

      {/* redacted name / contact bars */}
      <Rect x={90} y={92} width={54} height={9} rx={4.5} fill={SKY} />
      <Rect x={90} y={107} width={38} height={7} rx={3.5} fill={TINT} stroke={SKY} strokeWidth={1} />

      {/* body lines */}
      <Rect x={56} y={126} width={86} height={5} rx={2.5} fill={SKY} />
      <Rect x={56} y={138} width={72} height={5} rx={2.5} fill={SKY} />

      {/* protection badge with a check — "safe / anonymous" */}
      <Circle cx={150} cy={150} r={23} fill="url(#anonBadge)" stroke={WHITE} strokeWidth={3} />
      <Path d="M140 150 l7 8 l13 -15" fill="none" stroke={WHITE} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Slide 2 — report safely in minutes: a glowing shield with a check and a few
 * warm sparkles. Reassuring, not clinical.
 */
export function ShieldArt({ width = 200, height = 200 }: ArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 200" fill="none">
      <Defs>
        <RadialGradient id="shieldGlow" cx="50%" cy="45%" r="55%">
          <Stop offset="0" stopColor={TINT} stopOpacity={0.95} />
          <Stop offset="1" stopColor={TINT} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="shieldFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK_LIGHT} />
          <Stop offset="1" stopColor={INK} />
        </LinearGradient>
      </Defs>

      {/* soft glow halo */}
      <Circle cx={100} cy={94} r={82} fill="url(#shieldGlow)" />

      {/* shield */}
      <Path
        d="M100 26 L158 50 V104 C158 144 132 172 100 188 C68 172 42 144 42 104 V50 Z"
        fill="url(#shieldFill)"
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      {/* left highlight for volume */}
      <Path
        d="M100 26 L71 38 V104 C71 138 84 160 100 176"
        fill="none"
        stroke={WHITE}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.14}
      />
      {/* check mark */}
      <Path
        d="M76 102 L94 122 L128 78"
        fill="none"
        stroke={WHITE}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* warm sparkles */}
      <Circle cx={152} cy={58} r={4} fill={ORANGE} />
      <Circle cx={46} cy={132} r={3} fill={ORANGE} />
      <Circle cx={150} cy={150} r={3.5} fill={ORANGE} opacity={0.85} />
    </Svg>
  );
}

/**
 * Slide 3 — leave instantly: an open door with warm light spilling through and
 * an arrow heading out toward it. Says "the way out is always one tap away".
 */
export function DoorArt({ width = 200, height = 200 }: ArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 200" fill="none">
      <Defs>
        <LinearGradient id="doorLeaf" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={INK} />
          <Stop offset="1" stopColor={INK_LIGHT} />
        </LinearGradient>
        <LinearGradient id="doorLight" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={WHITE} />
          <Stop offset="1" stopColor={WARM} />
        </LinearGradient>
        <LinearGradient id="doorBeam" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={ORANGE} stopOpacity={0.28} />
          <Stop offset="1" stopColor={ORANGE} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* warm beam pooling on the floor */}
      <Path d="M112 168 L160 168 L182 194 L74 194 Z" fill="url(#doorBeam)" />

      {/* door frame (right) */}
      <Rect x={104} y={28} width={66} height={142} rx={9} fill={INK} />
      {/* bright opening — light from outside */}
      <Rect x={113} y={37} width={48} height={133} rx={4} fill="url(#doorLight)" />
      {/* a couple of soft light rays */}
      <Line x1={137} y1={46} x2={137} y2={160} stroke={ORANGE} strokeWidth={2} opacity={0.18} strokeLinecap="round" />
      <Line x1={149} y1={52} x2={149} y2={154} stroke={ORANGE} strokeWidth={1.5} opacity={0.14} strokeLinecap="round" />

      {/* open leaf, swung toward the viewer on the left hinge */}
      <Path
        d="M104 28 L58 42 V170 L104 170 Z"
        fill="url(#doorLeaf)"
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      {/* handle */}
      <Circle cx={95} cy={100} r={3.5} fill={WHITE} />

      {/* floor */}
      <Line x1={30} y1={170} x2={188} y2={170} stroke={INK} strokeWidth={SW} strokeLinecap="round" />

      {/* dashed path heading out through the lit doorway, with an arrowhead */}
      <Line
        x1={48}
        y1={132}
        x2={128}
        y2={132}
        stroke={ORANGE}
        strokeWidth={3.2}
        strokeDasharray="7,7"
        strokeLinecap="round"
      />
      <Path
        d="M122 123 L136 132 L122 141"
        fill="none"
        stroke={ORANGE}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Slide (unused by the current 3-slide flow, kept for reuse) — language: three
 * overlapping speech bubbles, refreshed to match the layered style above.
 */
export function LanguageArt({ width = 220, height = 190 }: ArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 190" fill="none">
      <Defs>
        <LinearGradient id="langA" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK_LIGHT} />
          <Stop offset="1" stopColor={INK} />
        </LinearGradient>
      </Defs>

      {/* back bubble (tint) */}
      <Path
        d="M118 40 h72 a16 16 0 0 1 16 16 v40 a16 16 0 0 1 -16 16 h-40 l-16 16 v-16 h-16 a16 16 0 0 1 -16 -16 V56 a16 16 0 0 1 16 -16 Z"
        fill={TINT}
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <Line x1={132} y1={68} x2={186} y2={68} stroke={INK} strokeWidth={SW} strokeLinecap="round" opacity={0.5} />
      <Line x1={132} y1={84} x2={172} y2={84} stroke={INK} strokeWidth={SW} strokeLinecap="round" opacity={0.5} />

      {/* front bubble (ink gradient) */}
      <Path
        d="M28 20 h84 a16 16 0 0 1 16 16 v44 a16 16 0 0 1 -16 16 H64 l-18 18 v-18 H28 a16 16 0 0 1 -16 -16 V36 a16 16 0 0 1 16 -16 Z"
        fill="url(#langA)"
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <Line x1={30} y1={44} x2={92} y2={44} stroke={WHITE} strokeWidth={SW} strokeLinecap="round" />
      <Line x1={30} y1={60} x2={104} y2={60} stroke={WHITE} strokeWidth={SW} strokeLinecap="round" opacity={0.85} />

      {/* warm accent dot */}
      <Ellipse cx={196} cy={132} rx={5} ry={5} fill={ORANGE} />
    </Svg>
  );
}
