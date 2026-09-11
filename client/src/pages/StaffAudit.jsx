/**
 * JusticeNow (web) — Staff Audit Trail page (route /staff/audit, ADMIN only).
 *
 * The append-only trail of staff actions (status changes, note adds,
 * assignments, admin mutations, logins). It answers WHO did WHAT and WHEN.
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md authorization matrix — "Analytics and
 * audit trail" is admin). The REAL boundary is the server: GET /api/audit is
 * guarded by requireStaff THEN requireRole('admin') and returns 403 to a
 * non-admin. In App.jsx this route sits behind RequireAdmin, which keeps a
 * non-admin off the page — but that is UX, not the security control.
 *
 * PRIVACY / ANONYMITY: the trail carries only WHO/WHAT/WHEN metadata. Each row's
 * `detail` holds non-sensitive facts (from/to status, org id, visibility flag) —
 * never case narrative, notes, evidence paths or reporter PII (there is no
 * reporter identity in the data model). `case_reference` is a case handle admins
 * already see in the case list. We NEVER log any of this.
 *
 * AUTH SESSION: every call goes through the token-bearing staffApi. A 401 means
 * the in-memory token has expired (we never persist it) — we log out and bounce
 * to /staff/login, the same leave-no-trace path the other staff screens use.
 *
 * All strings go through t().
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { fetchAudit } from '../api/client';
import { AUDIT_ACTIONS } from '../constants';
import { useAuth } from '../context/AuthContext';
import './StaffAudit.css';

// Page size for each fetch. The server clamps to a max of 100; 50 fills a page
// while keeping each request light.
const PAGE_SIZE = 50;

// Format an ISO timestamp for display (date + time); fall back to the raw string
// on unparseable input so we never crash on unexpected data.
function formatDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Resolve a readable action label, falling back to the raw action if a key is
// missing (defensive: a new server action could arrive before its i18n key).
function actionLabel(action, t) {
  const label = t(`auditActions.${action}`);
  return label && label !== `auditActions.${action}` ? label : action;
}

/**
 * Build a compact, human-readable detail line from an entry's `detail` object,
 * per action. Returns null when there is nothing safe/useful to show. Kept
 * defensive: `detail` may be null or missing fields, so every access is guarded.
 *
 * PRIVACY: `detail` only ever carries WHO/WHAT metadata by construction, so this
 * renderer cannot expose case content — it just formats the metadata already
 * stored (from/to status, org id, visibility flag). We never render narrative or
 * note text (the audit API does not return it — do not invent it).
 */
function renderDetail(entry, t) {
  const d = entry.detail;
  if (!d) return null;

  switch (entry.action) {
    case 'status_changed': {
      const from = typeof d.from === 'string' ? t(`statuses.${d.from}`) : null;
      const to = typeof d.to === 'string' ? t(`statuses.${d.to}`) : null;
      if (!from || !to) return null;
      let line = `${from} → ${to}`;
      // A reason is a justification the staffer typed (not case content) — safe
      // to show, and important for accountability on a backward move.
      if (typeof d.reason === 'string' && d.reason.trim()) {
        line += ` · ${t('audit.reasonLabel')}: ${d.reason.trim()}`;
      }
      return line;
    }
    case 'note_added': {
      // Show ONLY whether the note was reporter-visible — never the note text
      // (it is never in `detail` anyway; this is metadata about the note).
      if (typeof d.is_reporter_visible !== 'boolean') return null;
      return d.is_reporter_visible
        ? t('audit.visibleToReporter')
        : t('audit.internalNote');
    }
    case 'case_assigned': {
      // The org id the case was routed to (or an explicit "unassigned").
      const orgId = d.assigned_org_id;
      if (orgId === null) return t('audit.unassigned');
      if (typeof orgId === 'string' && orgId) return `${t('audit.orgLabel')}: ${orgId}`;
      return null;
    }
    default:
      // Admin mutations (org_*, staff_*) and staff_login carry no client-facing
      // detail line for now — the action label + actor + timestamp are enough.
      return null;
  }
}

/**
 * One audit row: a localised action label, the actor (name / "system" / "—"),
 * the timestamp, an optional case reference (mono), and a compact detail line
 * built per action. Everything is defensive — `detail` may be null.
 */
function AuditRow({ entry }) {
  const { t } = useTranslation();

  // Actor: a resolved name, or "system" when the action had no actor (null),
  // or a dash if the id is present but the name could not be resolved (a
  // since-deleted staff row). We never show the raw id — it means nothing to a
  // human and is not useful in the trail.
  const actorText = entry.actor_id
    ? entry.actor_name || '—'
    : t('audit.system');

  const detailLine = renderDetail(entry, t);

  return (
    <li className="audit-row">
      <div className="audit-row-top">
        <span className="audit-action">{actionLabel(entry.action, t)}</span>
        <span className="audit-time">{formatDateTime(entry.created_at)}</span>
      </div>

      <span className="audit-actor">{actorText}</span>

      {entry.case_reference && (
        <span className="audit-reference mono">{entry.case_reference}</span>
      )}

      {detailLine && <span className="audit-detail">{detailLine}</span>}
    </li>
  );
}

function StaffAudit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [action, setAction] = useState('');
  const [entries, setEntries] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(true); // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false); // "load more" in flight
  const [failed, setFailed] = useState(false);

  // Drop the dead in-memory session and return to login (same 401 path as the
  // other staff screens — tokens are never persisted; see AuthContext).
  const goToLogin = useCallback(() => {
    logout();
    navigate('/staff/login');
  }, [logout, navigate]);

  // Load a page. When `reset` is true we replace the list (first load or a
  // filter change); otherwise we append (Load more). We pass the offset
  // explicitly so a rapid Load-more does not read a stale state value.
  const load = useCallback(
    async (nextOffset, reset) => {
      setFailed(false);
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetchAudit({
          limit: PAGE_SIZE,
          offset: nextOffset,
          action: action || undefined,
        });
        const { entries: page, has_more: moreAvailable } = res.data.data;
        setEntries((prev) => (reset ? page : [...prev, ...page]));
        setHasMore(moreAvailable);
        setOffset(nextOffset + page.length);
      } catch (err) {
        // Never log the error — an audit payload carries staff/case metadata.
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          goToLogin();
          return;
        }
        setFailed(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [action, goToLogin],
  );

  // Reload from the top whenever the action filter changes (and on first mount).
  useEffect(() => {
    setEntries([]);
    setOffset(0);
    load(0, true);
  }, [load]);

  const onLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    load(offset, false);
  }, [loadingMore, hasMore, offset, load]);

  return (
    <div className="page staff-page">
      <h1>{t('audit.title')}</h1>

      <label htmlFor="actionFilter">{t('audit.filterByAction')}</label>
      <select
        id="actionFilter"
        value={action}
        onChange={(e) => setAction(e.target.value)}
      >
        {/* Empty value clears the filter — never sent to the API (see load). */}
        <option value="">{t('audit.allActions')}</option>
        {AUDIT_ACTIONS.map((a) => (
          <option key={a} value={a}>{t(`auditActions.${a}`)}</option>
        ))}
      </select>

      {loading && <p>{t('common.loading')}</p>}

      {failed && !loading && (
        <>
          <p className="field-error">{t('audit.networkError')}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => load(0, true)}
          >
            {t('common.retry')}
          </button>
        </>
      )}

      {!loading && !failed && entries.length === 0 && (
        <p className="audit-empty">{t('audit.empty')}</p>
      )}

      {!loading && !failed && entries.length > 0 && (
        <>
          <ul className="audit-list">
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>

          {hasMore && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? t('common.loading') : t('audit.loadMore')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default StaffAudit;
