/**
 * JusticeNow — Check case status (placeholder).
 * NEXT SPRINT: enter a reference code -> see status + timeline of
 * reporter-visible notes.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function CheckStatus() {
  const { t } = useTranslation();

  return (
    <div className="page">
      <h1>{t('status.title')}</h1>
      <p>{t('common.comingSoon')}</p>
      <Link to="/" className="btn btn-link">{t('common.back')}</Link>
    </div>
  );
}

export default CheckStatus;
