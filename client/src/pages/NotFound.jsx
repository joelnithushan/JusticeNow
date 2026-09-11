/**
 * JusticeNow — 404 page for unknown routes.
 *
 * We render a real themed page rather than silently redirecting home, so a
 * mistyped or stale link is honestly reported and the user can choose to go back.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="page not-found">
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <Link to="/" className="btn btn-secondary">
        {t('notFound.home')}
      </Link>
    </div>
  );
}

export default NotFound;
