/**
 * JusticeNow — Shown once after a successful submission.
 *
 * Displays the reference code prominently. The code arrives via router
 * state (in memory only). If the user reloads or lands here directly,
 * there is no code to show — redirect home rather than showing a broken
 * page. This is intentional: we never persist the code on the device.
 */

import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function ReportSuccess() {
  const { t } = useTranslation();
  const location = useLocation();
  const referenceCode = location.state?.referenceCode;
  const [copied, setCopied] = useState(false);

  if (!referenceCode) {
    return <Navigate to="/" replace />;
  }

  // Click the code to copy it. Convenience only — the code lives in router
  // state (in memory); nothing is persisted to the device.
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(referenceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — silently ignore;
      // the code is still selectable/visible.
    }
  };

  return (
    <div className="page success-page">
      <h1>{t('success.title')}</h1>

      <p className="label">{t('success.yourCode')}</p>
      <button
        type="button"
        className="reference-code"
        onClick={copyCode}
        aria-label={referenceCode}
        title={t('success.tapToCopy')}
      >
        {referenceCode}
      </button>
      <p className="copy-hint" aria-live="polite">
        {copied ? t('success.copied') : t('success.tapToCopy')}
      </p>

      <p className="warning"><strong>{t('success.writeItDown')}</strong></p>
      <p>{t('success.explanation')}</p>

      <nav className="home-actions">
        <Link to="/status" className="btn btn-secondary">{t('success.checkStatusButton')}</Link>
        <Link to="/" className="btn btn-link">{t('success.backHome')}</Link>
      </nav>
    </div>
  );
}

export default ReportSuccess;
