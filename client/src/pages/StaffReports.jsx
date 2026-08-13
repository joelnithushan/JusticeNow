/**
 * JusticeNow — Staff view: list of incoming reports.
 * Shows case type, district, submission date and status, with a
 * case-type filter. (Auth guard arrives with staff login next sprint.)
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchReports } from '../api/client';
import { CASE_TYPES } from '../constants';

function StaffReports() {
  const { t } = useTranslation();

  const [reports, setReports] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reload whenever the filter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchReports({ caseType: typeFilter })
      .then((res) => {
        if (!cancelled) setReports(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setError(t('staffReports.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [typeFilter, t]);

  return (
    <div className="page staff-page">
      <h1>{t('staffReports.title')}</h1>

      <label htmlFor="typeFilter">{t('staffReports.filterByType')}</label>
      <select
        id="typeFilter"
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value)}
      >
        <option value="">{t('staffReports.allTypes')}</option>
        {CASE_TYPES.map((type) => (
          <option key={type} value={type}>{t(`caseTypes.${type}`)}</option>
        ))}
      </select>

      {loading && <p>{t('common.loading')}</p>}
      {error && <p className="field-error">{error}</p>}
      {!loading && !error && reports.length === 0 && <p>{t('staffReports.empty')}</p>}

      {!loading && !error && reports.length > 0 && (
        <table className="reports-table">
          <thead>
            <tr>
              <th>{t('staffReports.referenceCode')}</th>
              <th>{t('staffReports.caseType')}</th>
              <th>{t('staffReports.district')}</th>
              <th>{t('staffReports.date')}</th>
              <th>{t('staffReports.status')}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.reference_code}</td>
                <td>{t(`caseTypes.${r.case_type}`)}</td>
                <td>{r.district}</td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>
                  <span className={`status-badge status-${r.status}`}>
                    {t(`statuses.${r.status}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default StaffReports;
