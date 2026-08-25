/**
 * JusticeNow — Case status result page (JNOW-11).
 *
 * Displays the outcome of a successful reference-code lookup:
 *
 *   1. Status chip — readable label + CSS class for pattern (not colour alone).
 *      Accessibility note: the status word is ALWAYS present in text;
 *      colour is only decoration on top of the label (WCAG 1.4.1).
 *
 *   2. "What happens next" block — a plain-language sentence explaining what
 *      the current status means and what to expect.  Translated per language.
 *
 *   3. Vertical timeline — reporter-visible notes from staff, newest at the
 *      bottom (chronological, oldest first), each showing date + note text.
 *
 * Data arrives via router state (in-memory only — cleared on reload).
 * If the user reloads or navigates here directly, we redirect to /status
 * so they can re-enter their code.  This is intentional: we never persist
 * the code or case data on the device.
 */

import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Format an ISO timestamp to a locale-appropriate date string.
 * We use the reporter's browser locale so date formatting feels natural.
 */
const formatDate = (isoString) =>
  new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

function CaseStatus() {
  const { t } = useTranslation();
  const location = useLocation();
  const { caseData, referenceCode } = location.state || {};

  // Guard: if there is no data (e.g. direct navigation or reload), send the
  // reporter back to the code-entry page rather than showing a broken view.
  if (!caseData) {
    return <Navigate to="/status" replace />;
  }

  const { status, created_at, case_type, district, case_notes } = caseData;

  return (
    <div className="page">
      {/* ---- Page heading ---- */}
      <h1>{t('status.caseStatus')}</h1>

      {/* ---- Meta row: code + submission date ---- */}
      <dl className="case-meta">
        <dt>{t('status.submittedOn')}</dt>
        <dd>{formatDate(created_at)}</dd>

        <dt>{t('status.caseType')}</dt>
        <dd>{t(`caseTypes.${case_type}`)}</dd>

        <dt>{t('status.district')}</dt>
        <dd>{district}</dd>
      </dl>

      {/* ---- Status chip ---- */}
      {/*
        The status is conveyed by the word (text label) AND the CSS class.
        Colour alone is never the only indicator (WCAG 1.4.1 – Use of Colour).
      */}
      <div className="status-display" aria-label={`${t('staffReports.status')}: ${t(`statuses.${status}`)}`}>
        <span className={`status-badge status-${status}`} aria-hidden="true">
          {t(`statuses.${status}`)}
        </span>
      </div>

      {/* ---- Plain-language "what happens next" explanation ---- */}
      <section className="next-step-block" aria-labelledby="next-step-heading">
        <h2 id="next-step-heading">{t('status.whatHappensNext')}</h2>
        <p>{t(`status.nextSteps.${status}`)}</p>
      </section>

      {/* ---- Timeline of reporter-visible notes ---- */}
      <section className="case-timeline" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">{t('status.updates')}</h2>

        {case_notes.length === 0 ? (
          <p className="timeline-empty">{t('status.noUpdates')}</p>
        ) : (
          <ol className="timeline-list">
            {case_notes.map((note) => (
              <li key={note.id} className="timeline-item">
                {/* Date shown above the note for easy scanning */}
                <time
                  className="timeline-date"
                  dateTime={note.created_at}
                >
                  {formatDate(note.created_at)}
                </time>
                <p className="timeline-note">{note.note}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---- Actions ---- */}
      <nav aria-label="Status page actions">
        {/*
          We pass the reference code back to CheckStatus via router state
          so the reporter can look up the same code again without retyping.
          Still in-memory only — no localStorage write.
        */}
        <Link
          to="/status"
          state={{ prefill: referenceCode }}
          className="btn btn-link"
          style={{ display: 'block', marginTop: '2rem' }}
        >
          {t('status.backToCheck')}
        </Link>
        <Link to="/" className="btn btn-link" style={{ display: 'block', marginTop: '0.5rem' }}>
          {t('common.back')}
        </Link>
      </nav>
    </div>
  );
}

export default CaseStatus;
