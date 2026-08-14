/**
 * JusticeNow — Shown once after a successful submission.
 *
 * Displays the reference code prominently. The code arrives via router
 * state (in memory only). If the user reloads or lands here directly,
 * there is no code to show — redirect home rather than showing a broken
 * page. This is intentional: we never persist the code on the device.
 */

import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReferenceCodeDisplay from '../components/ReferenceCodeDisplay';

function ReportSuccess() {
  const { t } = useTranslation();
  const location = useLocation();
  const referenceCode = location.state?.referenceCode;

  if (!referenceCode) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page success-page">
      <h1>{t('success.title')}</h1>

      <p className="label">{t('success.yourCode')}</p>
      <ReferenceCodeDisplay referenceCode={referenceCode} />

      <p>{t('success.explanation')}</p>

      <nav className="home-actions">
        <Link to="/status" className="btn btn-secondary">{t('success.checkStatusButton')}</Link>
        <Link to="/" className="btn btn-link">{t('success.backHome')}</Link>
      </nav>
    </div>
  );
}

export default ReportSuccess;
