/**
 * JusticeNow (web) — Legal resource directory (list + filter).
 *
 * A PUBLIC, UNAUTHENTICATED browse of active legal-aid organisations. Reporters
 * never log in here — the list is fetched through the TOKENLESS reporter `api`
 * (fetchOrganisations), so no staff Authorization header is ever attached.
 *
 * Two optional filters (District, Case type) narrow the list; each is clearable
 * back to "all" via its empty-string option. Each card links to /directory/:id.
 *
 * The directory is PUBLIC, so there is no no-oracle concern like the status
 * screen: any failure surfaces the same generic, retryable network error and we
 * never leak server text into the UI. All strings go through t().
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchOrganisations } from '../api/client';
import { CASE_TYPES, DISTRICTS } from '../constants';
import './Directory.css';

function Directory() {
  const { t } = useTranslation();

  // Both filters are optional; '' means "no filter" (show all).
  const [district, setDistrict] = useState('');
  const [caseType, setCaseType] = useState('');

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetchOrganisations({
        district: district || undefined,
        caseType: caseType || undefined,
      });
      setOrgs(res.data.data);
    } catch {
      // Any failure surfaces the same generic, retryable error — we never leak
      // server text into the UI (see CLAUDE.md — no server details in errors).
      setError(true);
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, [district, caseType]);

  // Re-fetch whenever a filter changes (or on first mount).
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <h1>{t('directory.title')}</h1>

      <div className="directory-filters">
        <div className="directory-filter">
          <label htmlFor="filterDistrict">{t('directory.filterDistrict')}</label>
          <select
            id="filterDistrict"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option value="">{t('directory.allDistricts')}</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="directory-filter">
          <label htmlFor="filterCaseType">{t('directory.filterCaseType')}</label>
          <select
            id="filterCaseType"
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
          >
            <option value="">{t('directory.allCaseTypes')}</option>
            {CASE_TYPES.map((c) => (
              <option key={c} value={c}>{t(`caseTypes.${c}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="directory-loading">{t('common.loading')}</p>
      ) : error ? (
        <div className="directory-error" role="alert">
          <p>{t('directory.networkError')}</p>
          <button type="button" className="btn btn-secondary" onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      ) : orgs.length === 0 ? (
        <p className="directory-empty">{t('directory.empty')}</p>
      ) : (
        <ul className="directory-list">
          {orgs.map((org) => (
            <li key={org.id}>
              <OrgCard org={org} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Presentational card: name, district, case-type chips, one-line description. */
function OrgCard({ org }) {
  const { t } = useTranslation();

  return (
    <Link to={`/directory/${org.id}`} className="org-card">
      <span className="org-card-name">{org.name}</span>
      <span className="org-card-district">{org.district}</span>

      {org.case_types.length > 0 && (
        <span className="org-chip-row">
          {org.case_types.map((c) => (
            <span key={c} className="org-chip">{t(`caseTypes.${c}`)}</span>
          ))}
        </span>
      )}

      {org.description && (
        <span className="org-card-desc">{org.description}</span>
      )}
    </Link>
  );
}

export default Directory;
