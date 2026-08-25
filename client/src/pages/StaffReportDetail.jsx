/**
 * JusticeNow — Staff: single case view with status control + notes (JNOW-13).
 *
 * STAFF ONLY. This route (/staff/reports/:id) is wrapped in ProtectedRoute, so
 * it never mounts for an unauthenticated user. Every API call additionally
 * carries the staff Bearer token (see AuthContext.session) — the server
 * verifies it and rejects anonymous callers with 401.
 *
 * ANONYMITY: nothing here identifies the reporter — the case simply has no
 * person attached. Notes are attributed to STAFF authors only.
 *
 * What staff can do here:
 *   - Change the case status (4-option segmented control; the current value is
 *     pre-selected). Status is always shown as WORDS, never colour alone.
 *   - Read the case's notes, newest first, with a clear marker on the ones the
 *     reporter can see.
 *   - Add a note. The "visible to the reporter" checkbox defaults to OFF, and
 *     the label spells out that an unchecked note is internal — an internal
 *     aside must never reach the reporter by accident.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StaffHeader from '../components/StaffHeader';
import { useAuth } from '../context/AuthContext';
import { CASE_STATUSES } from '../constants';
import {
  fetchReport,
  fetchCaseNotes,
  updateReportStatus,
  addCaseNote,
  fetchEvidenceUrl,
} from '../api/client';

function formatDateTime(iso, locale) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StaffReportDetail() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { id } = useParams();
  const { session } = useAuth();
  // The staff access token proves this request comes from a signed-in officer.
  const token = session?.access_token;

  const [caseData, setCaseData] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Status control
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Add-note form. `visible` defaults to false — internal unless chosen.
  const [noteText, setNoteText] = useState('');
  const [visible, setVisible] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  // Evidence viewer (JNOW-35)
  const [openingEvidence, setOpeningEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    try {
      const [caseRes, notesRes] = await Promise.all([
        fetchReport(id, token),
        fetchCaseNotes(id, token),
      ]);
      setCaseData(caseRes.data.data);
      setNotes(notesRes.data.data ?? []);
    } catch {
      setLoadError(t('staffReportDetail.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id, token, t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleStatusChange = async (next) => {
    if (!caseData || next === caseData.status || savingStatus) return;
    setSavingStatus(true);
    setStatusError('');
    try {
      const res = await updateReportStatus(id, next, token);
      // Reflect the server's confirmed value (status + updated_at).
      setCaseData((prev) => ({ ...prev, ...res.data.data }));
    } catch {
      setStatusError(t('staffReportDetail.statusFailed'));
    } finally {
      setSavingStatus(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim() || savingNote) return;
    setSavingNote(true);
    setNoteError('');
    try {
      await addCaseNote(
        id,
        { note: noteText.trim(), isReporterVisible: visible },
        token,
      );
      // Reset the form and reload notes so the new one appears at the top.
      setNoteText('');
      setVisible(false);
      const notesRes = await fetchCaseNotes(id, token);
      setNotes(notesRes.data.data ?? []);
    } catch {
      setNoteError(t('staffReportDetail.noteFailed'));
    } finally {
      setSavingNote(false);
    }
  };

  // Fetch a short-lived signed URL on demand and open the attachment. We only
  // request the URL when staff click — it expires quickly, so it is never held.
  const openEvidence = async () => {
    if (openingEvidence) return;
    setOpeningEvidence(true);
    setEvidenceError('');
    try {
      const res = await fetchEvidenceUrl(id, token);
      const url = res.data.data?.url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setEvidenceError(t('staffReportDetail.evidenceFailed'));
      }
    } catch {
      setEvidenceError(t('staffReportDetail.evidenceFailed'));
    } finally {
      setOpeningEvidence(false);
    }
  };

  return (
    <div className="page staff-page">
      <StaffHeader />

      <Link to="/staff/reports" className="btn btn-link">
        ← {t('staffReports.title')}
      </Link>

      <h1>{t('staffReportDetail.title')}</h1>

      {loading && (
        <p className="staff-state" role="status">
          {t('common.loading')}
        </p>
      )}

      {!loading && loadError && (
        <div className="staff-state staff-error" role="alert">
          <p className="field-error">{loadError}</p>
        </div>
      )}

      {!loading && !loadError && caseData && (
        <>
          {/* ---- Case summary ---- */}
          <dl className="case-meta">
            <dt>{t('staffReports.referenceCode')}</dt>
            <dd className="mono">{caseData.reference_code}</dd>
            <dt>{t('staffReports.caseType')}</dt>
            <dd>{t(`caseTypes.${caseData.case_type}`)}</dd>
            <dt>{t('staffReports.district')}</dt>
            <dd>{caseData.district}</dd>
            <dt>{t('staffReports.submittedDate')}</dt>
            <dd>{formatDateTime(caseData.created_at, locale)}</dd>
          </dl>

          {caseData.description && (
            <>
              <p className="report-label">{t('staffReports.fullDescription')}</p>
              <p className="report-full-description">{caseData.description}</p>
            </>
          )}

          {/* ---- Evidence (JNOW-35) ---- */}
          <section className="evidence-block" aria-labelledby="evidence-heading">
            <h2 id="evidence-heading">{t('staffReportDetail.evidenceHeading')}</h2>
            {caseData.evidence_path ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={openEvidence}
                  disabled={openingEvidence}
                >
                  {openingEvidence
                    ? t('staffReportDetail.evidenceOpening')
                    : t('staffReportDetail.openEvidence')}
                </button>
                {/* Reassures the reviewer this is a private, expiring link. */}
                <p className="privacy-note small">
                  {t('staffReportDetail.evidenceHint')}
                </p>
                {evidenceError && (
                  <p className="field-error" role="alert">
                    {evidenceError}
                  </p>
                )}
              </>
            ) : (
              <p className="staff-empty">{t('staffReportDetail.noEvidence')}</p>
            )}
          </section>

          {/* ---- Status control ---- */}
          <section className="status-control" aria-labelledby="status-heading">
            <h2 id="status-heading">{t('staffReportDetail.statusHeading')}</h2>
            {/* radiogroup: the current status is pre-selected; the word is always
                shown, so status is never conveyed by colour alone. */}
            <div
              className="segmented"
              role="radiogroup"
              aria-label={t('staffReportDetail.statusHeading')}
            >
              {CASE_STATUSES.map((s) => {
                const isCurrent = caseData.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={isCurrent}
                    className={`segmented-option status-${s}${isCurrent ? ' is-selected' : ''}`}
                    onClick={() => handleStatusChange(s)}
                    disabled={savingStatus}
                  >
                    {t(`statuses.${s}`)}
                  </button>
                );
              })}
            </div>
            <p className="segmented-current">
              {t('staffReportDetail.currentStatus')}:{' '}
              <span className={`status-badge status-${caseData.status}`}>
                {t(`statuses.${caseData.status}`)}
              </span>
            </p>
            {statusError && (
              <p className="field-error" role="alert">
                {statusError}
              </p>
            )}
          </section>

          {/* ---- Notes ---- */}
          <section className="case-notes" aria-labelledby="notes-heading">
            <h2 id="notes-heading">{t('staffReportDetail.notesHeading')}</h2>

            {/* Add-note form */}
            <form onSubmit={handleAddNote} className="add-note-form">
              <label htmlFor="note-text">{t('staffReportDetail.addNoteLabel')}</label>
              <textarea
                id="note-text"
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t('staffReportDetail.addNotePlaceholder')}
              />

              {/* Default OFF. The label makes it unmistakable that leaving it
                  unchecked keeps the note INTERNAL — never shown to the reporter. */}
              <label className="visible-toggle">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => setVisible(e.target.checked)}
                />
                <span>
                  {t('staffReportDetail.visibleToggle')}
                  <span className="visible-toggle-hint">
                    {visible
                      ? t('staffReportDetail.visibleOn')
                      : t('staffReportDetail.visibleOff')}
                  </span>
                </span>
              </label>

              {noteError && (
                <p className="field-error" role="alert">
                  {noteError}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingNote || !noteText.trim()}
              >
                {savingNote
                  ? t('staffReportDetail.addingNote')
                  : t('staffReportDetail.addNote')}
              </button>
            </form>

            {/* Notes list, newest first */}
            {notes.length === 0 ? (
              <p className="staff-state staff-empty" role="status">
                {t('staffReportDetail.noNotes')}
              </p>
            ) : (
              <ul className="notes-list">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className={`note-item${n.is_reporter_visible ? ' is-visible' : ''}`}
                  >
                    <div className="note-head">
                      <span className="note-author">
                        {n.author_name || t('staffReportDetail.unknownAuthor')}
                      </span>
                      <span className="note-date">
                        {formatDateTime(n.created_at, locale)}
                      </span>
                    </div>
                    {/* Word marker (not colour alone) so the visibility of a note
                        is unambiguous to every reader. */}
                    <span
                      className={`note-visibility ${n.is_reporter_visible ? 'visible' : 'internal'}`}
                    >
                      {n.is_reporter_visible
                        ? t('staffReportDetail.markerVisible')
                        : t('staffReportDetail.markerInternal')}
                    </span>
                    <p className="note-text">{n.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default StaffReportDetail;
