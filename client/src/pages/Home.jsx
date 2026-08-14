/**
 * JusticeNow — Landing page.
 * The two main actions (report / check status),
 * plus links to the directory and staff login.
 *
 * Note: LanguageSwitcher is rendered in App.jsx (the app-level header)
 * so it is visible on every page — it is NOT duplicated here.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function Home() {
  const { t } = useTranslation();

  return (
    <div className="page home-page">
      <h1>{t('app.title')}</h1>
      <p className="tagline">{t('app.tagline')}</p>

      <nav className="home-actions">
        <div className="primary-action-group">
          <p className="privacy-note">{t('home.privacyNote')}</p>
          <Link to="/report" className="btn btn-primary">{t('home.reportCase')}</Link>
        </div>
        <Link to="/status" className="btn btn-secondary">{t('home.checkStatus')}</Link>
        <Link to="/directory" className="btn btn-link">{t('home.directory')}</Link>
        <Link to="/staff/login" className="btn btn-link subtle">{t('home.staffLogin')}</Link>
      </nav>
    </div>
  );
}

export default Home;
