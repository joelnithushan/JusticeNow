/**
 * JusticeNow — Neutral cover screen shown after Quick Exit.
 *
 * WHY THIS EXISTS
 * When the reporter taps Quick Exit, she lands here. This screen must reveal
 * NOTHING about JusticeNow to anyone glancing at the phone: no logo, no app
 * name, no "you have exited" message. It reads as an ordinary clock screen —
 * unremarkable, the kind of thing a phone shows when idle.
 *
 * The only way back is a small, unlabelled dot for the person who tapped Exit
 * by mistake. It carries a neutral accessible name only ("go back") and does
 * not name or hint at the app it returns to.
 *
 * NOTE ON HISTORY: the button navigates here with { replace: true }, so the
 * previous (report) page is swapped out of history and the browser Back button
 * cannot restore it. This component itself holds no case data.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function QuickExitScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // A live clock makes the cover look like a normal idle screen rather than a
  // blank (which could itself look broken and draw attention). This is only a
  // text update once a minute — not an animation — so there is nothing for
  // prefers-reduced-motion to suppress.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="exit-screen">
      <div className="exit-clock">
        <p className="exit-time">{time}</p>
        <p className="exit-date">{date}</p>
      </div>

      {/* Discreet return: a faint dot with only a neutral accessible name.
          It goes to the app home (replace: true so this cover is not left in
          history). Nothing here identifies what the user is returning to. */}
      <button
        type="button"
        className="exit-return"
        onClick={() => navigate('/', { replace: true })}
        aria-label={t('quickExit.back')}
      >
        <span aria-hidden="true">·</span>
      </button>
    </div>
  );
}

export default QuickExitScreen;
