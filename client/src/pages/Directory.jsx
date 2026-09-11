import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchOrganisations } from '../api/client';
import { CASE_TYPES, DISTRICTS } from '../constants';

function Directory() {
  const { t } = useTranslation();
  const [organisations, setOrganisations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [district, setDistrict] = useState('');
  const [caseType, setCaseType] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchOrganisations({ search, district, caseType });
      setOrganisations(data.data || []);
    } catch (err) {
      setError(t('directory.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Debounce the search input slightly to avoid thrashing the API
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, district, caseType]);

  const clearFilters = () => {
    setSearch('');
    setDistrict('');
    setCaseType('');
  };

  return (
    <div className="page directory-page">
      <h1>{t('directory.title')}</h1>

      <div className="directory-filters">
        <input
          type="text"
          placeholder={t('directory.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          /* Placeholders are not an accessible name — give each filter control
             an explicit aria-label so screen readers (and axe) can identify it. */
          aria-label={t('directory.searchPlaceholder')}
        />

        <div className="filter-chips">
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            aria-label={t('directory.districtFilter')}
          >
            <option value="">{t('directory.districtFilter')}</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
            aria-label={t('directory.caseTypeFilter')}
          >
            <option value="">{t('directory.caseTypeFilter')}</option>
            {CASE_TYPES.map((c) => (
              <option key={c} value={c}>
                {t(`caseTypes.${c}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="field-error">{error}</div>}

      {loading ? (
        <p>{t('common.loading')}</p>
      ) : organisations.length === 0 ? (
        <div className="empty-state">
          <p>{t('directory.emptyState')}</p>
          {(search || district || caseType) && (
            <button type="button" onClick={clearFilters} className="btn btn-secondary">
              {t('directory.clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <ul className="reports-list">
          {organisations.map((org) => (
            <li key={org.id} className="report-card">
              <Link
                to={`/directory/${org.id}`}
                state={{ org }}
                className="report-card-header"
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    marginBottom: '0.2rem',
                  }}
                >
                  {org.name}
                </div>

                {org.description && (
                  <div
                    className="report-value"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {org.description}
                  </div>
                )}

                <div className="report-meta" style={{ marginTop: '0.5rem' }}>
                  {(org.contact_phone || org.contact_email) && (
                    <span className="status-badge status-closed">
                      {org.contact_phone || org.contact_email}
                    </span>
                  )}
                  <span className="status-badge status-referred">{org.district}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: '2rem' }}>
        <Link to="/" className="btn btn-link">
          {t('common.back')}
        </Link>
      </div>
    </div>
  );
}

export default Directory;
