/**
 * JusticeNow (web) — Staff Analytics page (route /staff/analytics).
 *
 * Aggregate dashboard for staff (attorneys / NGO officers / admins). Reached
 * through the RequireStaff guard in App.jsx; available to ALL staff roles.
 *
 * ANONYMITY (by construction): everything shown here is an AGGREGATE COUNT. The
 * server's /api/analytics payload carries no rows, ids, reference codes,
 * narrative or reporter identity — the case_reports table has no identity
 * columns at all — so there is nothing here that could identify a reporter.
 *
 * AUTH: fetched through the token-bearing staffApi (see src/api/client.js). A
 * 401 means the in-memory token has expired (we never persist it), so we log
 * out and bounce to /staff/login — the same leave-no-trace path as StaffReports.
 *
 * CHARTS: no chart library. Each "bar" is a plain div whose width is a fraction
 * of the row's count over the largest count in THAT section, so bars stay
 * proportional and never overflow. All strings go through t().
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { fetchAnalytics } from '../api/client';
import { CASE_STATUSES, CASE_TYPES } from '../constants';
import { useAuth } from '../context/AuthContext';
import './StaffAnalytics.css';

// How many districts to show at most — the server already drops empty ones, but
// cap the list so a busy deployment cannot produce an unbounded wall of bars.
const MAX_DISTRICT_BARS = 10;

/**
 * A titled group of horizontal bars. Each bar's width is proportional to the
 * MAX count in THIS section (never across sections — otherwise a huge status
 * count would flatten the month bars). A zero-count row still renders a
 * labelled empty track, so empty categories stay visible and accessible.
 */
function BarSection({ title, bars }) {
  // Guard against divide-by-zero when every count is 0 (all-empty section).
  const max = Math.max(1, ...bars.map((b) => b.count));

  return (
    <section className="analytics-section">
      <h2 className="analytics-section-title">{title}</h2>
      {bars.map((bar) => {
        const fraction = bar.count / max;
        // A tiny minimum keeps a >0 bar visible; a 0-count row shows no fill.
        const widthPct = bar.count === 0 ? 0 : Math.max(fraction, 0.02) * 100;
        return (
          <div
            className="bar-row"
            key={bar.key}
            aria-label={`${bar.label}: ${bar.count}`}
          >
            <span className="bar-label" title={bar.label}>{bar.label}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${widthPct}%` }} />
            </span>
            <span className="bar-count">{bar.count}</span>
          </div>
        );
      })}
    </section>
  );
}

function StaffAnalytics() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Drop the dead in-memory session and return to login (same 401 path as
  // StaffReports — tokens are never persisted; see AuthContext).
  const goToLogin = useCallback(() => {
    logout();
    navigate('/staff/login');
  }, [logout, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetchAnalytics();
      setAnalytics(res.data.data);
    } catch (err) {
      // Do NOT log the error — even aggregate payloads should not hit logs.
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [goToLogin]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="page staff-page">
        <h1>{t('analytics.title')}</h1>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="page staff-page">
        <h1>{t('analytics.title')}</h1>
        <p className="field-error">{t('analytics.networkError')}</p>
        <button type="button" className="btn btn-secondary" onClick={load}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // "No data yet": total 0 means an empty (or freshly seeded) deployment. Show a
  // friendly line rather than a page of empty bars.
  const isEmpty = !analytics || analytics.total === 0;

  // Status / case type: fixed, known order from the shared constants so the bars
  // are stable across renders and locales. Localise each label via t().
  const statusBars = analytics
    ? CASE_STATUSES.map((v) => ({
        key: v,
        label: t(`statuses.${v}`),
        count: analytics.by_status?.[v] ?? 0,
      }))
    : [];

  const caseTypeBars = analytics
    ? CASE_TYPES.map((v) => ({
        key: v,
        label: t(`caseTypes.${v}`),
        count: analytics.by_case_type?.[v] ?? 0,
      }))
    : [];

  // Districts: server returns only non-zero districts (an object). Sort by count
  // desc and cap to MAX_DISTRICT_BARS. District names are proper nouns — not
  // translated (consistent with the reports list, which shows district raw).
  const districtBars = analytics
    ? Object.entries(analytics.by_district ?? {})
        .map(([key, count]) => ({ key, label: key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_DISTRICT_BARS)
    : [];

  // Recent volume: already oldest → newest from the server; label with the raw
  // 'YYYY-MM' month key.
  const monthBars = analytics
    ? (analytics.recent_by_month ?? []).map((m) => ({
        key: m.month,
        label: m.month,
        count: m.count,
      }))
    : [];

  return (
    <div className="page staff-page">
      <h1>{t('analytics.title')}</h1>

      {/* Prominent total-cases figure. */}
      <div className="analytics-total-card">
        <span className="analytics-total-number">
          {analytics ? analytics.total : 0}
        </span>
        <span className="analytics-total-label">{t('analytics.total')}</span>
      </div>

      {isEmpty ? (
        <p className="analytics-empty">{t('analytics.empty')}</p>
      ) : (
        <>
          <BarSection title={t('analytics.byStatus')} bars={statusBars} />
          <BarSection title={t('analytics.byCaseType')} bars={caseTypeBars} />
          {districtBars.length > 0 && (
            <BarSection title={t('analytics.byDistrict')} bars={districtBars} />
          )}
          <BarSection title={t('analytics.recentVolume')} bars={monthBars} />
        </>
      )}
    </div>
  );
}

export default StaffAnalytics;
