/**
 * JusticeNow (web) — Staff case-detail page (route /staff/case/:id).
 *
 * The full staff view of a single case: metadata, narrative, evidence (via a
 * short-lived signed URL), the notes timeline (internal + reporter-visible), the
 * add-note form, org assignment, and the status-transition actions the current
 * role may take. Reached from the reports list, behind RequireStaff (App.jsx).
 *
 * AUTHORIZATION BOUNDARY: every call here goes through the token-bearing
 * staffApi. The server is the real boundary — it decides what a role may read or
 * do and returns 403/400 when a move is not allowed / lacks a required reason.
 *
 * PRIVACY: this is a staff-only surface, so it may DISPLAY the narrative, notes
 * and evidence — but it must NEVER log any of them, and nothing is persisted to
 * the device. The evidence link is intentionally short-lived; if it expires the
 * staffer refreshes the case to mint a fresh one server-side.
 *
 * AUTH: a 401 means the in-memory token has expired (we never persist it) — we
 * log out and bounce to /staff/login, the same leave-no-trace path the reports
 * list uses.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  fetchCaseDetail,
  addCaseNote,
  changeCaseStatus,
  assignCase,
  fetchOrganisations,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import './StaffCaseDetail.css';

// Format an ISO timestamp for display; fall back to the raw string on
// unparseable input so we never crash on unexpected data.
function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function StaffCaseDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { id } = useParams();

  const [caseData, setCaseData] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  // 'notFound' | 'network' | null — distinct so the UI can message each clearly.
  const [failed, setFailed] = useState(null);

  // Send the user back to login after clearing the dead session. Tokens are
  // never persisted; a 401 means the in-memory token has expired.
  const goToLogin = useCallback(() => {
    logout();
    navigate('/staff/login', { replace: true });
  }, [logout, navigate]);

  // Returns true when it handled a 401 (so callers can stop early).
  const handledAuthError = useCallback(
    (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return true;
      }
      return false;
    },
    [goToLogin],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setFailed(null);
    try {
      // Fetch the case and the (public) active org list in parallel. Orgs power
      // the assign dropdown; the org endpoint is tokenless/public by design.
      const [caseRes, orgRes] = await Promise.all([
        fetchCaseDetail(id),
        fetchOrganisations(),
      ]);
      setCaseData(caseRes.data.data);
      setOrgs(orgRes.data.data);
    } catch (err) {
      // Never log err — a case payload could carry narrative/notes.
      if (handledAuthError(err)) return;
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setFailed('notFound');
        return;
      }
      setFailed('network');
    } finally {
      setLoading(false);
    }
  }, [id, handledAuthError]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="page staff-page">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="page staff-page">
        <p className="field-error" role="alert">
          {failed === 'notFound'
            ? t('caseDetail.notFound')
            : t('caseDetail.networkError')}
        </p>
        <button type="button" className="btn btn-secondary" onClick={load}>
          {t('common.retry')}
        </button>
        <Link to="/staff/reports" className="btn btn-link">{t('caseDetail.back')}</Link>
      </div>
    );
  }

  if (!caseData) return null;

  return (
    <div className="page staff-page case-detail">
      <Link to="/staff/reports" className="btn btn-link back-link">
        {`‹ ${t('caseDetail.back')}`}
      </Link>

      <div className="case-header">
        <span className="mono reference">{caseData.reference_code}</span>
        <span className={`status-badge status-${caseData.status}`}>
          {t(`statuses.${caseData.status}`)}
        </span>
      </div>

      <MetadataCard caseData={caseData} />
      <NarrativeCard description={caseData.description} />
      <EvidenceCard caseData={caseData} onRefresh={load} />
      <AssignCard
        caseData={caseData}
        orgs={orgs}
        onDone={load}
        onAuthError={handledAuthError}
      />
      <NotesCard caseData={caseData} onDone={load} onAuthError={handledAuthError} />
      <StatusActionsCard
        caseData={caseData}
        onDone={load}
        onAuthError={handledAuthError}
      />
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  );
}

function MetadataCard({ caseData }) {
  const { t } = useTranslation();
  return (
    <section className="case-card">
      <h2>{t('caseDetail.metadataTitle')}</h2>
      <MetaRow
        label={t('caseDetail.caseTypeLabel')}
        value={t(`caseTypes.${caseData.case_type}`)}
      />
      <MetaRow label={t('caseDetail.districtLabel')} value={caseData.district} />
      <MetaRow
        label={t('caseDetail.incident')}
        value={
          caseData.incident_date
            ? formatDate(caseData.incident_date)
            : t('caseDetail.notProvided')
        }
      />
      <MetaRow label={t('caseDetail.submitted')} value={formatDate(caseData.created_at)} />
      <MetaRow label={t('caseDetail.updated')} value={formatDate(caseData.updated_at)} />
    </section>
  );
}

function NarrativeCard({ description }) {
  const { t } = useTranslation();
  return (
    <section className="case-card">
      <h2>{t('caseDetail.narrativeTitle')}</h2>
      {/* Staff-only: the narrative is shown here but must never be logged. */}
      <p className="narrative">{description}</p>
    </section>
  );
}

function EvidenceCard({ caseData, onRefresh }) {
  const { t } = useTranslation();
  return (
    <section className="case-card">
      <h2>{t('caseDetail.evidenceTitle')}</h2>
      {caseData.has_evidence && caseData.evidence_url ? (
        <>
          {/* Short-lived signed URL minted server-side. Opens in a new tab;
              rel=noreferrer so the evidence URL never leaks via Referer. Never
              log this URL. */}
          <a
            className="btn btn-secondary"
            href={caseData.evidence_url}
            target="_blank"
            rel="noreferrer"
          >
            {t('caseDetail.openEvidence')}
          </a>
          <p className="hint">{t('caseDetail.evidenceShortLived')}</p>
          {/* Re-fetch to mint a fresh signed URL if the current one has expired. */}
          <button type="button" className="btn btn-link" onClick={onRefresh}>
            {t('common.retry')}
          </button>
        </>
      ) : (
        <p className="muted">{t('caseDetail.noEvidence')}</p>
      )}
    </section>
  );
}

function AssignCard({ caseData, orgs, onDone, onAuthError }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = async (e) => {
    const value = e.target.value; // '' = unassign sentinel → null on the wire
    setSaving(true);
    setError('');
    try {
      await assignCase(caseData.id, value ? value : null);
      onDone();
    } catch (err) {
      if (onAuthError(err)) return;
      setError(t('caseDetail.assignFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="case-card">
      <h2>{t('caseDetail.assignedTitle')}</h2>
      <p className="muted">
        {caseData.assigned_org
          ? `${t('caseDetail.assignedTo')}: ${caseData.assigned_org.name} · ${caseData.assigned_org.district}`
          : t('caseDetail.unassigned')}
      </p>

      <label htmlFor="assignOrg">{t('caseDetail.assignLabel')}</label>
      <select
        id="assignOrg"
        value={caseData.assigned_org_id || ''}
        disabled={saving}
        onChange={handleChange}
      >
        {/* Empty value is the "unassign" option — maps to null on the wire. */}
        <option value="">{t('caseDetail.unassign')}</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{`${o.name} · ${o.district}`}</option>
        ))}
      </select>

      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}

function NoteRow({ note }) {
  const { t } = useTranslation();
  return (
    <li className="note-row">
      <div className="note-top">
        <span
          className={`status-badge ${note.is_reporter_visible ? 'note-visible' : 'note-internal'}`}
        >
          {note.is_reporter_visible
            ? t('caseDetail.reporterVisibleBadge')
            : t('caseDetail.internalBadge')}
        </span>
        <span className="note-date">{formatDate(note.created_at)}</span>
      </div>
      <p className="note-text">{note.note}</p>
      <p className="note-author">
        {`${t('caseDetail.authorLabel')}: ${note.author_name || t('caseDetail.unknownAuthor')}`}
      </p>
    </li>
  );
}

function NotesCard({ caseData, onDone, onAuthError }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(false); // default OFF — internal note
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setError(t('caseDetail.emptyNote'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addCaseNote(caseData.id, { note: trimmed, isReporterVisible: visible });
      // Clear the note text once it has served its purpose (leave no trace in
      // component state beyond what is needed) and reset the visibility default.
      setNote('');
      setVisible(false);
      onDone();
    } catch (err) {
      if (onAuthError(err)) return;
      setError(t('caseDetail.noteFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="case-card">
      <h2>{t('caseDetail.notesTitle')}</h2>

      {caseData.notes.length === 0 ? (
        <p className="muted">{t('caseDetail.noNotes')}</p>
      ) : (
        <ul className="notes-list">
          {caseData.notes.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </ul>
      )}

      <form onSubmit={submit} noValidate>
        <label htmlFor="newNote">{t('caseDetail.addNote')}</label>
        <textarea
          id="newNote"
          rows={4}
          value={note}
          placeholder={t('caseDetail.notePlaceholder')}
          disabled={saving}
          onChange={(e) => setNote(e.target.value)}
        />

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={visible}
            disabled={saving}
            onChange={(e) => setVisible(e.target.checked)}
          />
          {t('caseDetail.visibleToReporter')}
        </label>

        {error && <p className="field-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('caseDetail.adding') : t('caseDetail.addNote')}
        </button>
      </form>
    </section>
  );
}

function StatusActionsCard({ caseData, onDone, onAuthError }) {
  const { t } = useTranslation();
  // The target the user is confirming (only set for a move that needs a reason).
  const [pendingReasonTarget, setPendingReasonTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isBackwardMove = useCallback(
    (target) => caseData.status === 'referred' && target === 'under_review',
    [caseData.status],
  );

  const doChange = useCallback(
    async (target, reasonText) => {
      setSaving(true);
      setError('');
      try {
        await changeCaseStatus(caseData.id, { status: target, reason: reasonText });
        setPendingReasonTarget(null);
        setReason('');
        onDone();
      } catch (err) {
        if (onAuthError(err)) return;
        setError(t('caseDetail.statusFailed'));
      } finally {
        setSaving(false);
      }
    },
    [caseData.id, onDone, onAuthError, t],
  );

  const onPressTarget = (target) => {
    // A backward referred→under_review move must be justified: reveal a required
    // reason input and defer the request until the staffer confirms.
    if (isBackwardMove(target)) {
      setError('');
      setPendingReasonTarget(target);
      return;
    }
    doChange(target);
  };

  const confirmReason = () => {
    if (!pendingReasonTarget) return;
    if (!reason.trim()) {
      setError(t('caseDetail.reasonRequired'));
      return;
    }
    doChange(pendingReasonTarget, reason.trim());
  };

  // No moves available for this role/status → render nothing (mirrors the
  // server, which never offers an invalid transition as an action).
  if (!caseData.allowed_transitions || caseData.allowed_transitions.length === 0) {
    return null;
  }

  return (
    <section className="case-card">
      <h2>{t('caseDetail.statusActionsTitle')}</h2>

      <div className="status-actions">
        {caseData.allowed_transitions.map((target) => (
          <button
            key={target}
            type="button"
            className="btn btn-secondary"
            disabled={saving || pendingReasonTarget !== null}
            onClick={() => onPressTarget(target)}
          >
            {t('caseDetail.moveTo', { status: t(`statuses.${target}`) })}
          </button>
        ))}
      </div>

      {pendingReasonTarget && (
        <div className="reason-box">
          <label htmlFor="statusReason">{t('caseDetail.reasonPlaceholder')}</label>
          <textarea
            id="statusReason"
            rows={3}
            value={reason}
            placeholder={t('caseDetail.reasonPlaceholder')}
            disabled={saving}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={confirmReason}
          >
            {saving ? t('caseDetail.changing') : t('caseDetail.confirm')}
          </button>
          <button
            type="button"
            className="btn btn-link"
            disabled={saving}
            onClick={() => {
              setPendingReasonTarget(null);
              setReason('');
              setError('');
            }}
          >
            {t('caseDetail.cancel')}
          </button>
        </div>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}

export default StaffCaseDetail;
