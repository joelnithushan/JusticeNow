/**
 * JusticeNow — Landing page.
 * Language switcher + the two main actions (report / check status),
 * plus links to the directory and staff login.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

function Home() {
  const { t } = useTranslation();

  return (
    <div className="page home-page">
      <LanguageSwitcher />

      <h1>{t('app.title')}</h1>
      <p className="tagline">{t('app.tagline')}</p>
      <p className="privacy-note">{t('home.privacyNote')}</p>

      <nav className="home-actions">
        <Link to="/report" className="btn btn-primary">{t('home.reportCase')}</Link>
        {/* "Track my case" — the ONE permitted orange secondary CTA on Home.
            Primary (Report a case) stays blue; the rest are neutral links. */}
        <Link to="/status" className="btn btn-accent">{t('home.checkStatus')}</Link>
        <Link to="/directory" className="btn btn-link">{t('home.directory')}</Link>
        <Link to="/about" className="btn btn-link">{t('home.about')}</Link>
        <Link to="/staff/login" className="btn btn-link subtle">{t('home.staffLogin')}</Link>
      </nav>
    </div>
  );
}

export default Home;
