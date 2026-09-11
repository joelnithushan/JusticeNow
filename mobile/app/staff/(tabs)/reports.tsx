/**
 * JusticeNow (mobile) — Staff Reports tab (real list).
 *
 * The authenticated case list for staff (attorneys / NGO officers / admins).
 * Reached at /staff/reports, inside the staff tab navigator whose _layout guards
 * for an authenticated session.
 *
 * ANONYMITY (by construction): the server's list projection carries NO reporter
 * identity — the case_reports table has no name/email/phone/user_id columns, so
 * there is nothing here that could identify a reporter, and nothing to hide. We
 * show only case metadata (reference code, status, type, district, submitted
 * date). The narrative and evidence are NOT in the list and are not shown here.
 *
 * AUTH: this list is a staff-only call and goes through fetchReports(), which
 * uses the token-bearing staffApi (see src/api/client.ts). If the server answers
 * 401 the in-memory token has expired (we never persist it — cold start / TTL),
 * so we log out and bounce to /staff/login rather than showing a stale error.
 *
 * All strings go through t(); all styling comes from theme tokens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import axios from 'axios';
import Svg, { Path } from 'react-native-svg';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import SelectField from '../../../components/SelectField';
import type { Option } from '../../../components/SelectField';
import ErrorState from '../../../components/ErrorState';
import { fetchReports } from '../../../src/api/client';
import type { ReportListItem } from '../../../src/api/client';
import { CASE_TYPES, CASE_STATUSES } from '../../../src/constants';
import { useAuth } from '../../../src/context/AuthContext';
import { useProfile } from '../../../src/context/ProfileContext';
import { colors, styles as theme } from '../../../src/theme';

// A sentinel used ONLY inside SelectField to represent "no filter". SelectField
// has no clear affordance of its own, so selecting this option clears the
// filter. The empty string is never sent to the API (fetchReports omits it).
const ALL = '';

export default function StaffReportsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { profile } = useProfile();

  const [caseType, setCaseType] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  // Send the user back to login after clearing the dead session. Wrapped so both
  // the 401 path and any future callers reset auth state before redirecting.
  const goToLogin = useCallback(() => {
    // In-memory token expired/invalid — drop it so no stale token lingers, then
    // require a fresh sign-in. (Tokens are never persisted; see AuthContext.)
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetchReports({
        caseType: caseType || undefined,
        status: status || undefined,
      });
      setReports(res.data.data);
    } catch (err) {
      // Do NOT log the error — a reports payload could contain case metadata.
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [caseType, status, goToLogin]);

  // Reload whenever the filters change (and on first mount).
  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const caseTypeOptions: Option[] = [
    { value: ALL, label: t('staffReports.allTypes') },
    ...CASE_TYPES.map((v) => ({ value: v, label: t(`caseTypes.${v}`) })),
  ];
  const statusOptions: Option[] = [
    { value: ALL, label: t('staffReports.allStatuses') },
    ...CASE_STATUSES.map((v) => ({ value: v, label: t(`statuses.${v}`) })),
  ];

  // Completion gate: an incomplete profile must finish before using any other
  // tab. If we land here with a loaded-but-incomplete profile, bounce to the
  // profile screen (the tab layout also hides this tab's button when gated).
  if (profile && profile.profile_completed === false) {
    return <Redirect href="/staff/profile" />;
  }

  return (
    <View style={local.screen}>
      {/* Blue dashboard header: title + live case count, an org/context subtitle,
          and sign-out (clears the session and returns to login — same leave-no-
          trace path as a 401). Extends up behind the status bar via the inset. */}
      <View style={[local.header, { paddingTop: insets.top + 12 }]}>
        <View style={local.headerMain}>
          <View style={local.titleRow}>
            <Text style={local.title}>{t('staffReports.title')}</Text>
            {!loading && !failed ? (
              <View style={local.countPill}>
                <Text style={local.countPillText}>{reports.length}</Text>
              </View>
            ) : null}
          </View>
          {profile?.organisation_name ? (
            <Text style={local.subtitle} numberOfLines={1}>
              {profile.organisation_name}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={goToLogin}
          style={local.signOut}
          accessibilityRole="button"
          accessibilityLabel={t('staffReports.signOut')}
        >
          <Text style={local.signOutText}>{t('staffReports.signOut')}</Text>
        </Pressable>
      </View>

      <View style={local.filters}>
        <SelectField
          label={t('staffReports.filterByType')}
          placeholder={t('staffReports.allTypes')}
          value={caseType || null}
          options={caseTypeOptions}
          onChange={setCaseType}
        />
        <SelectField
          label={t('staffReports.filterByStatus')}
          placeholder={t('staffReports.allStatuses')}
          value={status || null}
          options={statusOptions}
          onChange={setStatus}
        />
      </View>

      {loading && !refreshing ? (
        <View style={local.centre}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : failed ? (
        <View style={local.centre}>
          <ErrorState message={t('staffReports.loadFailed')} onRetry={load} />
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={local.list}
          renderItem={({ item }) => <ReportCard item={item} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={local.centre}>
              <Text style={local.emptyText}>{t('staffReports.empty')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

/**
 * One report row. Pressable → /staff/case/[id] (the U7 detail screen; the route
 * may not exist yet, that's expected — it resolves once U7 lands). Shows only
 * safe case metadata: no reporter identity exists to show.
 */
function ReportCard({ item }: { item: ReportListItem }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      style={local.card}
      onPress={() => router.push(`/staff/case/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.reference_code}, ${t(`statuses.${item.status}`)}`}
    >
      <View style={local.cardTop}>
        <Text style={local.reference}>{item.reference_code}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={local.caseType}>{t(`caseTypes.${item.case_type}`)}</Text>
      <View style={local.cardMeta}>
        <View style={local.metaLeft}>
          <Text style={local.metaText}>{item.district}</Text>
          <Text style={local.metaDot}>·</Text>
          <Text style={local.metaText}>{formatDate(item.created_at)}</Text>
        </View>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path
            d="M9 6 l6 6 l-6 6"
            stroke={colors.muted}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </Pressable>
  );
}

// Status badge, coloured by state within the palette: closed cases read as a
// muted/neutral chip (done), open cases as a blue chip (active). We deliberately
// avoid orange here — the "one orange element" rule means a list of many chips
// must stay blue/neutral.
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const closed = status === 'closed';
  return (
    <View style={[local.badge, closed && local.badgeClosed]}>
      <Text style={[local.badgeText, closed && local.badgeTextClosed]}>
        {t(`statuses.${status}`)}
      </Text>
    </View>
  );
}

// Format an ISO timestamp for display; fall back to the raw string on unparseable
// input so we never crash on unexpected data.
function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const local = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Brand-blue app bar.
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: colors.primary,
  },
  headerMain: { flex: 1, marginRight: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primaryText,
    flexShrink: 1,
  },
  // White pill with the navy count — pops on the blue bar.
  countPill: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  subtitle: { marginTop: 2, fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  signOut: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
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
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reference: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    // Monospaced so the reference code (JN-XXXXXXXX) reads clearly.
    fontFamily: 'monospace',
    flexShrink: 1,
    marginRight: 8,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.primaryTint,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  // Closed cases: neutral/muted so active cases stand out.
  badgeClosed: { backgroundColor: '#eef1f3' },
  badgeTextClosed: { color: colors.muted },
  caseType: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 10,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: {
    fontSize: 13,
    color: colors.muted,
  },
  metaDot: { fontSize: 13, color: colors.border },
});
