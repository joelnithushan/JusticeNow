/**
 * JusticeNow — Staff: individual case report detail (STAFF ONLY).
 *
 * JNOW-32 scope: this route (/staff/reports/:id) is GUARDED by ProtectedRoute.
 * The detailed view of a single report is out of scope for this sprint.
 * This placeholder ensures the route exists and is protected; the full
 * implementation will follow in a subsequent story.
 *
 * REPORTER SAFETY: This page is unreachable without authentication.
 */

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StaffHeader from '../components/StaffHeader';

function StaffReportDetail() {
  const { t }  = useTranslation();
  const { id } = useParams(); // the report UUID from the URL

  return (
    <div className="page staff-page">
      {/* Staff header with logout — same pattern as StaffReports */}
      <StaffHeader />

      <h1>{t('staffReportDetail.title')}</h1>
      <p className="mono" style={{ marginBottom: '1rem' }}>
        {t('staffReportDetail.reportId')}: {id}
      </p>
      <p>{t('common.comingSoon')}</p>

      <Link to="/staff/reports" className="btn btn-secondary" style={{ marginTop: '1.5rem' }}>
        {t('staffReports.title')}
      </Link>
    </div>
  );
}

export default StaffReportDetail;
