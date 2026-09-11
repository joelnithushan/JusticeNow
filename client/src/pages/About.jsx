/**
 * JusticeNow (web) — About / How-it-works / Privacy & Safety.
 *
 * A calm, read-only informational page for reporters explaining what JusticeNow
 * is, how the report → reference-code → status-check flow works, and — most
 * importantly — the anonymity and safety guarantees the whole product is built
 * on. Mirrors mobile/app/about.tsx.
 *
 * SAFETY / ANONYMITY messaging (see CLAUDE.md — anonymity by construction):
 *  - We restate, in plain language, that no name/phone/email/account exists and
 *    that the reference code is the ONLY link to a case and cannot be recovered.
 *    This is not marketing copy — it sets the reporter's correct mental model so
 *    they write the code down and understand the risk of losing it.
 *  - Nothing on this page fetches, stores, or logs anything; it is static text
 *    via t() only. Quick Exit is mounted globally, so we do NOT add one here.
 *
 * All user-facing strings go through t().
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './About.css';

function About() {
  const { t } = useTranslation();

  return (
    <div className="page about-page">
      <h1>{t('about.title')}</h1>

      {/* 1 · What JusticeNow is */}
      <section className="about-section">
        <h2>{t('about.whatTitle')}</h2>
        <p>{t('about.whatBody')}</p>
      </section>

      {/* 2 · How it works — a 3-step ordered list. */}
      <section className="about-section">
        <h2>{t('about.howTitle')}</h2>
        <ol className="about-steps">
          <li>{t('about.how1')}</li>
          <li>{t('about.how2')}</li>
          <li>{t('about.how3')}</li>
        </ol>
      </section>

      {/* 3 · Your anonymity — a callout so it reads as a promise, not body text. */}
      <section className="about-callout">
        <h2>{t('about.anonTitle')}</h2>
        <p>{t('about.anonBody1')}</p>
        <p>{t('about.anonBody2')}</p>
      </section>

      {/* 4 · Staying safe — Quick Exit explainer + where to keep the code. */}
      <section className="about-callout">
        <h2>{t('about.safetyTitle')}</h2>
        <p>{t('about.safetyBody')}</p>
      </section>

      {/* 5 · SDG 16 footer line. */}
      <p className="about-footer">{t('about.footer')}</p>

      <Link to="/" className="btn btn-link">{t('common.back')}</Link>
    </div>
  );
}

export default About;
