/**
 * JusticeNow — Staff login (placeholder).
 * NEXT SPRINT: Supabase Auth for staff. Remember: ONLY staff log in —
 * reporters never authenticate, by design.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function StaffLogin() {
  const { t } = useTranslation();

  return (
    <div className="page">
      <h1>{t('staffLogin.title')}</h1>
      <p>{t('common.comingSoon')}</p>
      {/* Temporary shortcut so the team can see the reports list while auth is pending */}
      <Link to="/staff/reports" className="btn btn-secondary">{t('staffReports.title')}</Link>
      <Link to="/" className="btn btn-link">{t('common.back')}</Link>
    </div>
  );
}

export default StaffLogin;
