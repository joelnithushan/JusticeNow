/**
 * JusticeNow (mobile) — Staff Audit Trail screen (route /staff/audit, ADMIN only).
 *
 * The append-only trail of staff actions (status changes, note adds, assignments,
 * admin mutations, logins). It answers WHO did WHAT and WHEN.
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md authorization matrix — "Analytics and
 * audit trail" is admin). The REAL boundary is the server: GET /api/audit is
 * guarded by requireStaff THEN requireRole('admin') and returns 403 to a
 * non-admin. The `isAdmin` redirect below is UX only — it keeps a non-admin from
 * landing on an empty/erroring screen; it is NOT the security control.
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
 * All strings go through t(); all styling comes from theme tokens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import axios from 'axios';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SelectField from '../../components/SelectField';
import type { Option } from '../../components/SelectField';
import ErrorState from '../../components/ErrorState';
import BackButton from '../../components/BackButton';
import { fetchAudit } from '../../src/api/client';
import type { AuditEntry } from '../../src/api/client';
import { AUDIT_ACTIONS } from '../../src/constants';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';

// Page size for each fetch. The server clamps to a max of 100; 50 keeps each
// request light on mobile data while still filling a screen.
const PAGE_SIZE = 50;

// Sentinel for "no action filter" inside SelectField (it has no clear
// affordance of its own). The empty string is never sent to the API.
const ALL = '';

export default function StaffAuditScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [action, setAction] = useState<string>(ALL);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(true); // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false); // "load more" in flight
  const [failed, setFailed] = useState(false);

  // Drop the dead in-memory session and return to login (same 401 path as the
  // other staff screens — tokens are never persisted; see AuthContext).
  const goToLogin = useCallback(() => {
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  // Load a page. When `reset` is true we replace the list (first load or a filter
  // change); otherwise we append (Load more). We pass the offset explicitly so a
  // rapid Load-more does not read a stale state value.
  const load = useCallback(
    async (nextOffset: number, reset: boolean) => {
      setFailed(false);
      try {
        const res = await fetchAudit({
          limit: PAGE_SIZE,
          offset: nextOffset,
          action: action || undefined,
        });
        const { entries: page, has_more } = res.data.data;
        setEntries((prev) => (reset ? page : [...prev, ...page]));
        setHasMore(has_more);
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
    setLoading(true);
    setEntries([]);
    setOffset(0);
    load(0, true);
  }, [load]);

  const onLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    load(offset, false);
  }, [loadingMore, hasMore, offset, load]);

  // Guard: non-admins should never reach this screen. The server is the real
  // boundary; this Redirect is UX so they land back on a screen they can use.
  if (!isAdmin) {
    return <Redirect href="/staff/reports" />;
  }

  const actionOptions: Option[] = [
    { value: ALL, label: t('audit.allActions') },
    ...AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`auditActions.${a}`) })),
  ];

  return (
    <View style={[local.screen, { paddingTop: insets.top }]}>
      <View style={local.header}>
        <BackButton onPress={() => router.back()} label={t('common.back')} />
        <Text style={local.title} accessibilityRole="header">
          {t('audit.title')}
        </Text>
      </View>

      <View style={local.filters}>
        <SelectField
          label={t('audit.filterByAction')}
          placeholder={t('audit.allActions')}
          value={action || null}
          options={actionOptions}
          onChange={setAction}
        />
      </View>

      {loading ? (
        <View style={local.centre}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : failed ? (
        <View style={local.centre}>
          <ErrorState message={t('audit.networkError')} onRetry={() => load(0, true)} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={local.list}
          renderItem={({ item }) => <AuditRow entry={item} />}
          ListEmptyComponent={
            <View style={local.centre}>
              <Text style={local.emptyText}>{t('audit.empty')}</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <Pressable
                onPress={onLoadMore}
                style={local.loadMore}
                accessibilityRole="button"
                accessibilityLabel={t('audit.loadMore')}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={local.loadMoreText}>{t('audit.loadMore')}</Text>
                )}
              </Pressable>
            ) : null
          }
        />
      )}
    </View>
  );
}

/**
 * One audit row: a localised action label, the actor (name / "system" / "—"),
 * the timestamp, an optional case reference (mono), and a compact human-readable
 * detail line built per action. Everything is defensive — `detail` may be null.
 */
function AuditRow({ entry }: { entry: AuditEntry }) {
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
    <View
      style={local.row}
      accessible
      accessibilityLabel={`${t(`auditActions.${entry.action}`) || entry.action}, ${actorText}`}
    >
      <View style={local.rowTop}>
        <Text style={local.action}>{actionLabel(entry.action, t)}</Text>
        <Text style={local.time}>{formatDateTime(entry.created_at)}</Text>
      </View>

      <Text style={local.actor}>{actorText}</Text>

      {entry.case_reference ? (
        <Text style={local.reference}>{entry.case_reference}</Text>
      ) : null}

      {detailLine ? <Text style={local.detail}>{detailLine}</Text> : null}
    </View>
  );
}

// Resolve a readable action label, falling back to the raw action if a key is
// missing (defensive: a new server action could arrive before its i18n key).
function actionLabel(action: string, t: (k: string) => string): string {
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
 * stored (from/to status, org id, visibility flag).
 */
function renderDetail(
  entry: AuditEntry,
  t: (k: string) => string,
): string | null {
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

// Format an ISO timestamp for display (date + time); fall back to the raw string
// on unparseable input so we never crash on unexpected data.
function formatDateTime(value: string): string {
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

const local = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
  },
  filters: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  centre: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 48,
  },
  emptyText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexGrow: 1,
  },
  row: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: 12,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  action: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: colors.muted,
  },
  actor: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  reference: {
    fontSize: 13,
    color: colors.primary,
    // Monospaced so the reference code (JN-XXXXXXXX) reads clearly.
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  detail: {
    fontSize: 13,
    color: colors.muted,
  },
  loadMore: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.primaryTint,
    marginTop: 4,
  },
  loadMoreText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
});
