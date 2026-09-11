/**
 * JusticeNow (web) — Staff view: list of incoming reports.
 *
 * The authenticated case list for staff (attorneys / NGO officers / admins).
 * Reached only through the RequireStaff guard (App.jsx); fetchReports uses the
 * token-bearing staffApi.
 *
 * ANONYMITY (by construction): the server's list projection carries NO reporter
 * identity — the case_reports table has no name/email/phone/user_id columns, so
 * there is nothing here that could identify a reporter, and nothing to hide. We
 * show only case metadata (reference code, status, type, district, submitted
 * date). The narrative and evidence are NOT in the list and are not shown here.
 *
 * AUTH: this list is a staff-only call. If the server answers 401 the in-memory
 * token has expired (we never persist it — a reload/TTL drops it), so we log out
 * and bounce to /staff/login rather than showing a stale error.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { fetchReports } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { CASE_TYPES, CASE_STATUSES } from '../constants';
import './StaffReports.css';

// Format an ISO timestamp for display; fall back to the raw string on
// unparseable input so we never crash on unexpected data.
function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function StaffReports() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [reports, setReports] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reload whenever either filter changes (and on first mount).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchReports({ caseType: typeFilter, status: statusFilter })
      .then((res) => {
        if (!cancelled) setReports(res.data.data);
      })
      .catch((err) => {
        if (cancelled) return;
        // Do NOT log the error — a reports payload could contain case metadata.
        // A 401 means the in-memory token has expired (we never persist it), so
        // drop the dead session and require a fresh sign-in.
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          logout();
          navigate('/staff/login', { replace: true });
          return;
        }
        setError(t('staffReports.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [typeFilter, statusFilter, logout, navigate, t]);

  return (
    <div className="page staff-page">
      <h1>{t('staffReports.title')}</h1>

      <div className="reports-filters">
        <div className="filter-group">
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
        </div>

        <div className="filter-group">
          <label htmlFor="statusFilter">{t('staffReports.filterByStatus')}</label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t('staffReports.allStatuses')}</option>
            {CASE_STATUSES.map((status) => (
              <option key={status} value={status}>{t(`statuses.${status}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p>{t('common.loading')}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
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
                <td className="mono">
                  {/* Row links to the full staff detail view. */}
                  <Link to={`/staff/case/${r.id}`}>{r.reference_code}</Link>
                </td>
                <td>{t(`caseTypes.${r.case_type}`)}</td>
                <td>{r.district}</td>
                <td>{formatDate(r.created_at)}</td>
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
