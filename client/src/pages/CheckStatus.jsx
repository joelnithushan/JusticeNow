/**
 * JusticeNow (web) — Check case status.
 *
 * An anonymous reporter enters the reference code they were given at submission
 * (JN-XXXXXXXX) and sees their case's current status plus any reporter-visible
 * notes staff have added. This screen NEVER authenticates and NEVER stores the
 * code — it lives in React state only, and Quick Exit (a full page navigation)
 * discards everything on the way out.
 *
 * PRIVACY / NO-ORACLE (see CLAUDE.md):
 *  - We call the TOKENLESS reporter `api` via fetchCaseStatus — reporters are
 *    anonymous, so no Authorization header is ever attached.
 *  - The server returns an IDENTICAL generic 404 for "not found" and "rate
 *    limited". We therefore treat ANY response-bearing error (a 4xx) the same
 *    way — the single generic status.notFound message — and never try to tell
 *    them apart, so the endpoint cannot be used as an enumeration oracle.
 *  - Only a transport failure (no response at all) shows the retryable network
 *    error; a 4xx is a definitive answer, not a retryable one.
 *  - We never log the code, the response, or any case content (the code can ride
 *    in the request URL).
 *
 * All user-facing strings go through t().
 */

import React, { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { fetchCaseStatus } from '../api/client';
import './CheckStatus.css';

// Format an ISO date/timestamp for display. Falls back to the raw string if the
// value is unparseable so we never crash on unexpected input.
function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function CheckStatus() {
  const { t } = useTranslation();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  // 'notFound' = definitive generic answer (no retry); 'network' = transport
  // failure (retryable). Anything that is not a network error is treated as
  // 'notFound' so we never build an oracle out of status codes.
  const [error, setError] = useState(null);

  const trimmedCode = code.trim();
  const canSubmit = trimmedCode.length > 0 && !loading;

  const lookup = async (e) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetchCaseStatus(trimmedCode);
      setResult(res.data.data);
    } catch (err) {
      // Do NOT log the error — it can carry the reference code in the URL.
      // A response with any status means the server answered: per the no-oracle
      // rule that answer is the single generic not-found. Only the total absence
      // of a response is a retryable network problem.
      if (axios.isAxiosError(err) && !err.response) {
        setError('network');
      } else {
        setError('notFound');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>{t('status.title')}</h1>

      <form onSubmit={lookup} noValidate>
        {/* Reference-code entry. autoCapitalize/spellCheck off because codes are
            upper-case (JN-XXXXXXXX); the server also uppercases defensively. */}
        <label htmlFor="referenceCode">{t('status.codeLabel')}</label>
        <input
          id="referenceCode"
          type="text"
          className="mono"
          value={code}
          placeholder={t('status.codePlaceholder')}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
          onChange={(ev) => setCode(ev.target.value)}
        />

        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {loading ? t('status.looking') : t('status.lookup')}
        </button>
      </form>

      {/* Generic not-found (also shown for rate-limited — indistinguishable by
          design). Announced to screen readers via role=alert. */}
      {error === 'notFound' && (
        <p className="status-not-found" role="alert">
          {t('status.notFound')}
        </p>
      )}

      {/* Transport failure only — offer a retry. */}
      {error === 'network' && (
        <div className="status-network-error" role="alert">
          <p>{t('status.networkError')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => lookup()}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {result && <StatusCard data={result} />}
    </div>
  );
}

/**
 * Presentational card for a found case. Renders ONLY the safe projection the
 * server sends (status, type, district, dates, reporter-visible notes) — the
 * response has no narrative/evidence field, so none can leak here.
 */
function StatusCard({ data }) {
  const { t } = useTranslation();

  return (
    <div className="status-card">
      <dl className="status-rows">
        <div className="status-row">
          <dt>{t('status.statusLabel')}</dt>
          <dd>
            {/* The reporter's status is the ONE permitted solid-orange chip on
                this case-tracking screen (on-secondary text for AA contrast). */}
            <span className="status-chip">{t(`statuses.${data.status}`)}</span>
          </dd>
        </div>
        <div className="status-row">
          <dt>{t('status.caseTypeLabel')}</dt>
          <dd>{t(`caseTypes.${data.case_type}`)}</dd>
        </div>
        <div className="status-row">
          <dt>{t('status.districtLabel')}</dt>
          <dd>{data.district}</dd>
        </div>
        {data.incident_date && (
          <div className="status-row">
            <dt>{t('status.incidentLabel')}</dt>
            <dd>{formatDate(data.incident_date)}</dd>
          </div>
        )}
        <div className="status-row">
          <dt>{t('status.submittedLabel')}</dt>
          <dd>{formatDate(data.created_at)}</dd>
        </div>
      </dl>

      <h2 className="status-notes-title">{t('status.notesTitle')}</h2>
      {data.notes.length === 0 ? (
        <p className="status-no-notes">{t('status.noNotes')}</p>
      ) : (
        <ul className="status-timeline">
          {data.notes.map((n, i) => (
            <li key={`${n.created_at}-${i}`} className="status-note">
              <p className="status-note-text">{n.note}</p>
              <p className="status-note-date">{formatDate(n.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CheckStatus;
