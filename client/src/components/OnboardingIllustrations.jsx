/**
 * JusticeNow — Onboarding illustrations.
 *
 * Every illustration here is inline SVG (no external files, no icon library):
 * flat, geometric, 2px navy strokes with rounded caps on the light background.
 * Deliberately abstract — no human faces, and nothing suggesting violence,
 * restraint, police or courts. Each one sits beside text that says the same
 * thing, so all are aria-hidden / role="presentation": they add nothing an
 * assistive-tech user is missing.
 *
 * The stroke colour is inherited (`currentColor`); the container sets it to the
 * onboarding navy via CSS, so these never hard-code the brand colour.
 */

import React from 'react';

// Shared attributes so all three illustrations read as one family.
const svgProps = {
  className: 'ob-svg',
  viewBox: '0 0 200 160',
  role: 'presentation',
  'aria-hidden': 'true',
  focusable: 'false',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/**
 * Slide 1 — language / communication.
 * Two overlapping speech bubbles, each with a couple of abstract "text" lines.
 * The rear bubble is filled with the page colour so the overlap reads cleanly.
 */
export function LanguageArt() {
  return (
    <svg {...svgProps}>
      {/* Rear bubble */}
      <rect x="16" y="26" width="112" height="66" rx="14" />
      <path d="M42 92 L42 112 L64 92" />
      <line x1="34" y1="50" x2="110" y2="50" />
      <line x1="34" y1="68" x2="92" y2="68" />
      {/* Front bubble — filled with the background so it sits on top */}
      <rect x="84" y="66" width="100" height="60" rx="14" fill="var(--ob-bg)" />
      <path d="M150 126 L150 144 L130 126" />
      <line x1="100" y1="88" x2="168" y2="88" />
      <line x1="100" y1="104" x2="146" y2="104" />
    </svg>
  );
}

/**
 * Slide 2 — anonymity.
 * A page whose top third — where a name and contact details would normally go —
 * is deliberately left blank, marked with a soft dashed edge. The ABSENCE is the
 * subject of the picture. Three solid lines below stand in for the body text.
 */
export function PrivacyDocArt() {
  return (
    <svg {...svgProps}>
      {/* Page outline */}
      <rect x="46" y="14" width="108" height="132" rx="10" />
      {/* The blank name/contact area — dashed, and intentionally empty */}
      <rect x="62" y="28" width="76" height="34" rx="6" strokeDasharray="5 6" />
      {/* Body text below the blank area */}
      <line x1="62" y1="88" x2="138" y2="88" />
      <line x1="62" y1="104" x2="138" y2="104" />
      <line x1="62" y1="120" x2="116" y2="120" />
    </svg>
  );
}

/**
 * Slide 3 — leaving instantly.
 * An open doorway with a clear path leading out through it. Four strokes:
 * the frame (open at the foot), the door standing ajar, and an arrow walking
 * out through the opening.
 */
export function DoorwayArt() {
  return (
    <svg {...svgProps}>
      {/* Door frame, open at the bottom so you can walk through it */}
      <path d="M74 142 L74 40 L126 40 L126 142" />
      {/* The door itself, standing open */}
      <path d="M74 40 L52 28 L52 130 L74 142" />
      {/* A clear path leading out through the opening (arrow points out) */}
      <path d="M100 62 L100 150" />
      <path d="M90 138 L100 152 L110 138" />
    </svg>
  );
}

/**
 * A STATIC, non-interactive replica of the Quick Exit control shown inline on
 * slide 3, so the user recognises the real button later. It mirrors the real
 * control exactly: a charcoal (#111827) circle with a white cross — NOT red,
 * NOT the navy primary (see QuickExitButton.jsx for the reasoning). This is a
 * picture, not a button; the sentence beside it is the accessible description.
 */
export function QuickExitReplica() {
  return (
    <svg
      className="ob-exit-replica"
      viewBox="0 0 56 56"
      width="48"
      height="48"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="28" cy="28" r="28" fill="#111827" />
      <path
        d="M18 18 L38 38 M38 18 L18 38"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * The small tick glyph used in the slide-2 reassurance list. aria-hidden — the
 * list item's text carries the meaning.
 */
export function TickGlyph() {
  return (
    <svg
      className="ob-tick"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5 L8 14.5 L16 5.5" />
    </svg>
  );
}
