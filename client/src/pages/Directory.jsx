/**
 * JusticeNow — Legal resource directory (placeholder).
 * NEXT SPRINT: browse legal aid organisations by district and case type.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function Directory() {
  const { t } = useTranslation();

  return (
    <div className="page">
      <h1>{t('directory.title')}</h1>
      <p>{t('common.comingSoon')}</p>
      <Link to="/" className="btn btn-link">{t('common.back')}</Link>
    </div>
  );
}

export default Directory;
