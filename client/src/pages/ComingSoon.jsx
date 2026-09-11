/**
 * JusticeNow — Shared placeholder page.
 *
 * Lets W2–W6 routes resolve and the build pass before their real pages exist.
 * Each of those units replaces this with the real screen.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

function ComingSoon() {
  const { t } = useTranslation();

  return (
    <div className="page">
      <p>{t('common.comingSoon')}</p>
    </div>
  );
}

export default ComingSoon;
