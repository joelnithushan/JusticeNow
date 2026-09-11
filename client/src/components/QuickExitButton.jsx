/**
 * JusticeNow — Quick Exit button (survivor-safety control).
 *
 * WHY THIS EXISTS
 * The user this protects may be reporting someone who has physical access to
 * her phone. If that person walks in mid-report she must be out of the app in
 * one tap — screen cleared, nothing recoverable. This is not a convenience
 * feature; every choice below optimises for "a frightened person, one hand,
 * two seconds", not for elegance.
 *
 * THE EXIT, IN ORDER (see onExit):
 *   a. clear all in-progress form state SYNCHRONOUSLY (via the Quick Exit
 *      context) — we do not await anything before the screen changes;
 *   b. navigate to a neutral screen with { replace: true } so the report page
 *      is not reachable via the browser Back button;
 *   c. the same clear (a) also drops any in-memory case data.
 * There is deliberately NO confirmation dialog — a prompt would defeat the
 * entire purpose.
 *
 * WHERE IT APPEARS
 * Every reporter screen. NOT the splash (nothing typed yet to clear) and NOT
 * staff screens (staff are authenticated and not the at-risk user — a
 * different threat model).
 *
 * APPEARANCE (see .quick-exit in index.css)
 * A charcoal (#111827) circle with a white cross: deliberately NOT red (red
 * reads as danger/delete) and NOT the navy primary (would read as just another
 * button). It carries the app's only drop shadow so it is always findable.
 */

import React, { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuickExit } from '../context/QuickExitContext';

// The neutral screen the button escapes to (see QuickExitScreen.jsx).
export const EXIT_PATH = '/exit';

/**
 * Reporter screens get the button; splash, staff and the exit screen itself do
 * not. A denylist (rather than an allowlist) means any future reporter page is
 * protected by default — the safe failure mode is "button shown".
 */
export function isReporterScreen(pathname) {
  if (pathname === '/') return false; // splash — nothing to clear yet
  if (pathname === EXIT_PATH) return false; // already on the neutral screen
  if (pathname.startsWith('/staff')) return false; // staff: different threat model
  // Onboarding: no case data has been entered yet, so there is nothing to
  // clear. Slide 3 shows only a STATIC picture of this control, not the control
  // itself — showing the live button here would be misleading.
  if (pathname.startsWith('/onboarding')) return false;
  return true;
}

function QuickExitButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { clearAll } = useQuickExit();

  const visible = isReporterScreen(location.pathname);

  const onExit = useCallback(() => {
    clearAll(); // (a)+(c) wipe in-progress form + in-memory case data, synchronously
    navigate(EXIT_PATH, { replace: true }); // (b) neutral screen, no Back-recovery
  }, [clearAll, navigate]);

  // Escape is a SECONDARY trigger only. Many mobile keyboards have no Escape
  // key, so we never rely on it — the visible button is the real control.
  // Only bound while the button is visible so it does nothing on staff/splash.
  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, onExit]);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="quick-exit"
      onClick={onExit}
      aria-label={t('quickExit.ariaLabel')}
    >
      {/* The cross is decorative; the button's aria-label is its accessible name. */}
      <svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export default QuickExitButton;
