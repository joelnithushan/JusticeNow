/**
 * DefaultAvatar — the neutral "no photo yet" profile picture (web).
 *
 * Shown for every staffer who has not uploaded their own avatar, so the UI never
 * has an empty avatar slot. Pure display fallback: nothing is written to the
 * database. Once a staffer uploads a photo (POST /api/staff/me/avatar) their real
 * avatar_url takes over everywhere. Mirrors mobile/components/DefaultAvatar.tsx.
 *
 * A generic grey person silhouette on a light grey disc — role-agnostic and the
 * universally-understood "no picture" look.
 */

// Neutral cool-greys, deliberately OFF-brand: a placeholder should read as
// "empty", not as a themed element.
const DISC = '#E9EDF0';
const FIGURE = '#94A3AD';

/**
 * @param {{ size?: number, className?: string }} props size in px (always circular).
 */
export default function DefaultAvatar({ size = 96, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-hidden="true"
    >
      <circle cx="48" cy="48" r="48" fill={DISC} />
      {/* Head */}
      <circle cx="48" cy="38" r="16" fill={FIGURE} />
      {/* Shoulders — a rounded cap clipped by the disc via the viewBox. */}
      <path d="M20 82c0-15.5 12.5-26 28-26s28 10.5 28 26v6H20z" fill={FIGURE} />
    </svg>
  );
}
