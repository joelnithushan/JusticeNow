/**
 * JusticeNow — Staff view: list of incoming anonymous case reports (STAFF ONLY).
 *
 * Legal aid attorneys and NGO officers use this page to triage what has
 * come in. There is NO reporter identity anywhere — the API never returns
 * one because the database never stores one.
 *
 * Auth guard: this page is wrapped in ProtectedRoute — unauthenticated users
 * are redirected to /staff/login before this component ever mounts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchReports } from '../api/client';
import { CASE_TYPES } from '../constants';
import StaffHeader from '../components/StaffHeader';

/** Characters shown in the collapsed description preview. */
const DESCRIPTION_PREVIEW_LENGTH = 120;

/**
 * Format an ISO date (YYYY-MM-DD or timestamp) for display.
 * Returns an em dash when the value is missing.
 */
function formatDate(isoDate, locale) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Shorten long text with an ellipsis for the collapsed row preview. */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function StaffReports() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [reports, setReports] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Which report row is expanded to show the full description (null = none).
  const [expandedId, setExpandedId] = useState(null);
  // Bump this counter to re-run the fetch (used by the error-state Retry button).
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Load reports from GET /api/reports.
   * Accepts an optional AbortSignal so in-flight requests are ignored
   * when the filter changes quickly.
   */
  const loadReports = useCallback(
    async (signal) => {
      setLoading(true);
      setError('');

      try {
        const res = await fetchReports({
          caseType: typeFilter || undefined,
        });

        if (signal?.aborted) return;

        // API shape: { success: true, data: [ ...reports ] }
        setReports(res.data.data ?? []);
        setExpandedId(null);
      } catch {
        if (signal?.aborted) return;
        setReports([]);
        setError(t('staffReports.loadFailed'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [typeFilter, t],
  );

  // Re-fetch whenever the case-type filter changes or the user clicks Retry.
  useEffect(() => {
    const controller = new AbortController();
    loadReports(controller.signal);
    return () => controller.abort();
  }, [loadReports, reloadToken]);

  const handleRetry = () => setReloadToken((n) => n + 1);

  /** Toggle expanded/collapsed state for a single report row. */
  const handleRowClick = (reportId) => {
    setExpandedId((prev) => (prev === reportId ? null : reportId));
  };

  return (
    <div className="page staff-page">
      {/* Staff header: shows logged-in email and logout button */}
      <StaffHeader />

      <h1>{t('staffReports.title')}</h1>

      {/* Case-type filter — sent to the API as ?case_type= */}
      <div className="staff-toolbar">
        <label htmlFor="typeFilter">{t('staffReports.filterByType')}</label>
        <select
          id="typeFilter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          disabled={loading && !error}
        >
          <option value="">{t('staffReports.allTypes')}</option>
          {CASE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`caseTypes.${type}`)}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Loading state ---- */}
      {loading && (
        <p className="staff-state" role="status">
          {t('common.loading')}
        </p>
      )}

      {/* ---- Error state with retry ---- */}
      {!loading && error && (
        <div className="staff-state staff-error" role="alert">
          <p className="field-error">{error}</p>
          <button type="button" className="btn btn-secondary staff-retry" onClick={handleRetry}>
            {t('staffReports.retry')}
          </button>
        </div>
      )}

      {/* ---- Empty state ---- */}
      {!loading && !error && reports.length === 0 && (
        <p className="staff-state staff-empty" role="status">
          {t('staffReports.empty')}
        </p>
      )}

      {/* ---- Reports list (newest first — ordering is done server-side) ---- */}
      {!loading && !error && reports.length > 0 && (
        <ul className="reports-list" aria-label={t('staffReports.title')}>
          {reports.map((report) => {
            const isExpanded = expandedId === report.id;
            const hasDescription = Boolean(report.description?.trim());
            const preview = truncateText(report.description, DESCRIPTION_PREVIEW_LENGTH);
            const showExpandHint = hasDescription && report.description.length > DESCRIPTION_PREVIEW_LENGTH;

            return (
              <li key={report.id} className={`report-card${isExpanded ? ' is-expanded' : ''}`}>
                <button
                  type="button"
                  className="report-card-header"
                  onClick={() => handleRowClick(report.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`report-desc-${report.id}`}
                >
                  <span className="report-meta">
                    <span className="report-label">{t('staffReports.referenceCode')}</span>
                    <span className="report-value mono">{report.reference_code}</span>
                  </span>

                  <span className="report-meta">
                    <span className="report-label">{t('staffReports.caseType')}</span>
                    <span className="report-value">{t(`caseTypes.${report.case_type}`)}</span>
                  </span>

                  <span className="report-meta">
                    <span className="report-label">{t('staffReports.district')}</span>
                    <span className="report-value">{report.district}</span>
                  </span>

                  <span className="report-meta">
                    <span className="report-label">{t('staffReports.incidentDate')}</span>
                    <span className="report-value">
                      {formatDate(report.incident_date, locale)}
                    </span>
                  </span>

                  <span className="report-meta">
                    <span className="report-label">{t('staffReports.submittedDate')}</span>
                    <span className="report-value">
                      {formatDate(report.created_at, locale)}
                    </span>
                  </span>

                  <span className="report-meta report-meta-status">
                    <span className="report-label">{t('staffReports.status')}</span>
                    <span className={`status-badge status-${report.status}`}>
                      {t(`statuses.${report.status}`)}
                    </span>
                  </span>

                  {hasDescription && !isExpanded && (
                    <span className="report-description-preview">
                      <span className="report-label">{t('staffReports.description')}</span>
                      <span className="report-value">{preview}</span>
                      {showExpandHint && (
                        <span className="report-expand-hint">{t('staffReports.expandHint')}</span>
                      )}
                    </span>
                  )}
                </button>

                {isExpanded && hasDescription && (
                  <div
                    id={`report-desc-${report.id}`}
                    className="report-card-body"
                  >
                    <p className="report-label">{t('staffReports.fullDescription')}</p>
                    <p className="report-full-description">{report.description}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default StaffReports;
