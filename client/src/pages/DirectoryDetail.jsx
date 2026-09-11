/**
 * JusticeNow (web) — Legal resource directory: organisation detail.
 *
 * A PUBLIC, UNAUTHENTICATED view of one active legal-aid organisation. Fetched
 * through the TOKENLESS reporter `api` (fetchOrganisation) — reporters never log
 * in, so no staff Authorization header is ever attached.
 *
 * Shows the org's name, district, full description, the case types it handles
 * (localised chips), and contact links: phone via tel: and email via mailto:.
 * A missing/inactive org shows the generic notFound message (a definitive
 * answer, no retry); a transport failure shows the retryable network error —
 * the same split as the status screen. All strings go through t().
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { fetchOrganisation } from '../api/client';
import './DirectoryDetail.css';

function DirectoryDetail() {
  const { t } = useTranslation();
  const { id } = useParams();

  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  // 'notFound' = definitive answer (missing/inactive org, no retry);
  // 'network' = transport failure (retryable).
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!id) {
      setError('notFound');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOrganisation(id);
      setOrg(res.data.data);
    } catch (err) {
      // Only a transport failure is retryable; a 404 (missing/inactive org) is a
      // definitive answer. We never leak server text into the UI.
      if (axios.isAxiosError(err) && !err.response) {
        setError('network');
      } else {
        setError('notFound');
      }
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <Link to="/directory" className="btn btn-link directory-back">
        {t('common.back')}
      </Link>

      {loading ? (
        <p className="directory-detail-loading">{t('common.loading')}</p>
      ) : error === 'network' ? (
        <div className="directory-detail-error" role="alert">
          <p>{t('directory.networkError')}</p>
          <button type="button" className="btn btn-secondary" onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      ) : error === 'notFound' || !org ? (
        <p className="directory-detail-notfound" role="alert">
          {t('directory.notFound')}
        </p>
      ) : (
        <>
          <h1>{org.name}</h1>
          <p className="directory-detail-district">{org.district}</p>

          {org.description && (
            <p className="directory-detail-desc">{org.description}</p>
          )}

          {org.case_types.length > 0 && (
            <section className="directory-detail-section">
              <h2>{t('directory.handles')}</h2>
              <div className="org-chip-row">
                {org.case_types.map((c) => (
                  <span key={c} className="org-chip">{t(`caseTypes.${c}`)}</span>
                ))}
              </div>
            </section>
          )}

          {(org.contact_phone || org.contact_email) && (
            <section className="directory-detail-section">
              <h2>{t('directory.contact')}</h2>
              {org.contact_phone && (
                <a href={`tel:${org.contact_phone}`} className="btn btn-primary">
                  {t('directory.call')} · {org.contact_phone}
                </a>
              )}
              {org.contact_email && (
                <a
                  href={`mailto:${org.contact_email}`}
                  className="btn btn-secondary directory-detail-email"
                >
                  {t('directory.email')} · {org.contact_email}
                </a>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default DirectoryDetail;
