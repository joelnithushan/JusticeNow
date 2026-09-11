/**
 * JusticeNow — "Staying Safe" guidance page (JNOW-40).
 *
 * A static, read-only page that explains safety practices to reporters.
 * No API calls, no form state, no localStorage writes — this page cannot
 * compromise anonymity in any way.
 *
 * The Quick Exit button renders automatically because /staying-safe is not
 * in the denylist inside QuickExitButton.isReporterScreen().
 *
 * Content is deliberately plain and direct: safety-critical instructions
 * must be understood quickly, often under stress.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function StayingSafe() {
  const { t } = useTranslation();

  return (
    <div className="page guidance-page">
      <h1>{t('stayingSafe.title')}</h1>
      <p className="tagline">{t('stayingSafe.intro')}</p>

      {/* ---- Quick Exit explanation ---- */}
      <section
        className="guidance-section"
        aria-labelledby="gs-quick-exit"
      >
        <h2 id="gs-quick-exit">{t('stayingSafe.quickExit.title')}</h2>
        <p>{t('stayingSafe.quickExit.body')}</p>
      </section>

      {/* ---- Reference code on shared devices ---- */}
      <section
        className="guidance-section"
        aria-labelledby="gs-ref-code"
      >
        <h2 id="gs-ref-code">{t('stayingSafe.refCode.title')}</h2>
        <p>{t('stayingSafe.refCode.body')}</p>
      </section>

      {/* ---- Private device and network ---- */}
      <section
        className="guidance-section"
        aria-labelledby="gs-private-device"
      >
        <h2 id="gs-private-device">{t('stayingSafe.privateDevice.title')}</h2>
        <p>{t('stayingSafe.privateDevice.body')}</p>
      </section>

      {/* ---- Who CAN see a report ---- */}
      <section
        className="guidance-section"
        aria-labelledby="gs-who-can"
      >
        <h2 id="gs-who-can">{t('stayingSafe.whoCanSee.title')}</h2>
        <p>{t('stayingSafe.whoCanSee.body')}</p>
      </section>

      {/* ---- Who CANNOT see a report ---- */}
      <section
        className="guidance-section"
        aria-labelledby="gs-who-cannot"
      >
        <h2 id="gs-who-cannot">{t('stayingSafe.whoCannotSee.title')}</h2>
        <p>{t('stayingSafe.whoCannotSee.body')}</p>
      </section>

      {/*
        Urgent help — visually distinct (red border) so it is immediately
        findable even when the user is skimming quickly.
        WCAG note: colour is supplemented by the section heading text and
        position at the bottom, so it is never colour-alone.
      */}
      <section
        className="guidance-section urgent-help"
        aria-labelledby="gs-urgent"
      >
        <h2 id="gs-urgent">{t('stayingSafe.urgentHelp.title')}</h2>
        <p>{t('stayingSafe.urgentHelp.body')}</p>
      </section>

      {/* ---- Navigation ---- */}
      <nav aria-label={t('stayingSafe.navLabel')} style={{ marginTop: '2rem' }}>
        <Link to="/" className="btn btn-link" style={{ display: 'block' }}>
          {t('stayingSafe.backHome')}
        </Link>
      </nav>
    </div>
  );
}

export default StayingSafe;
