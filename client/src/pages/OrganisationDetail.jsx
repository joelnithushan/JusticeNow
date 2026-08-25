import React from 'react';
import { useLocation, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function OrganisationDetail() {
  const { t } = useTranslation();
  const location = useLocation();
  const org = location.state?.org;

  if (!org) {
    // If accessed directly without state, redirect to directory
    return <Navigate to="/directory" replace />;
  }

  return (
    <div className="page org-detail-page">
      <Link to="/directory" className="btn-link subtle" style={{ display: 'inline-block', marginBottom: '1rem' }}>
        &larr; {t('common.back')}
      </Link>
      
      <h1 style={{ marginBottom: '0.5rem' }}>{org.name}</h1>
      <p className="report-label" style={{ marginBottom: '1.5rem' }}>{org.district}</p>

      {org.description && (
        <div className="report-full-description" style={{ marginBottom: '2rem' }}>
          {org.description}
        </div>
      )}

      {org.case_types && org.case_types.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>{t('directory.handledCaseTypes')}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {org.case_types.map((type) => (
              <span key={type} className="status-badge status-received">
                {t(`caseTypes.${type}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {(org.contact_phone || org.contact_email) && (
        <div className="next-step-block">
          <h2>{t('directory.contactTitle')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            {org.contact_phone && (
              <a href={`tel:${org.contact_phone}`} className="btn btn-primary">
                {t('directory.call')}: {org.contact_phone}
              </a>
            )}
            {org.contact_email && (
              <a href={`mailto:${org.contact_email}`} className="btn btn-secondary">
                {t('directory.email')}: {org.contact_email}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OrganisationDetail;
