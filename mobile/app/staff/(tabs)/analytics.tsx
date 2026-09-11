/**
 * JusticeNow (mobile) — Staff Analytics tab.
 *
 * Aggregate dashboard for staff (attorneys / NGO officers / admins). Reached at
 * /staff/analytics, inside the staff tab navigator whose _layout guards for an
 * authenticated session. Available to ALL staff roles.
 *
 * ANONYMITY (by construction): everything shown here is an AGGREGATE COUNT. The
 * server's /api/analytics payload carries no rows, ids, reference codes,
 * narrative or reporter identity — the case_reports table has no identity
 * columns at all — so there is nothing here that could identify a reporter.
 *
 * AUTH: fetched through the token-bearing staffApi (see src/api/client.ts). A
 * 401 means the in-memory token has expired (we never persist it), so we log out
 * and bounce to /staff/login — the same leave-no-trace path as reports.tsx.
 *
 * CHARTS: no chart library. Each "bar" is a plain View whose width is a fraction
 * of the row's count over the largest count in that section, so bars stay
 * proportional and never overflow. All strings go through t(); theme tokens only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import axios from 'axios';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import ErrorState from '../../../components/ErrorState';
import StaffHeader from '../../../components/StaffHeader';
import { fetchAnalytics } from '../../../src/api/client';
import type { Analytics } from '../../../src/api/client';
import { CASE_STATUSES, CASE_TYPES } from '../../../src/constants';
import { useAuth } from '../../../src/context/AuthContext';
import { useProfile } from '../../../src/context/ProfileContext';
import { colors, styles as theme } from '../../../src/theme';

// How many districts to show at most — the server already drops empty ones, but
// cap the list so a busy deployment cannot produce an unbounded wall of bars.
const MAX_DISTRICT_BARS = 10;

export default function StaffAnalyticsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();
  const { profile } = useProfile();

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  // Drop the dead in-memory session and return to login (same 401 path as
  // reports.tsx — tokens are never persisted; see AuthContext).
  const goToLogin = useCallback(() => {
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetchAnalytics();
      setAnalytics(res.data.data);
    } catch (err) {
      // Do NOT log the error — even aggregate payloads should not hit logs.
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [goToLogin]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // Completion gate: force an incomplete profile to the profile screen before
  // any other tab is usable (the tab layout also hides this button when gated).
  if (profile && profile.profile_completed === false) {
    return <Redirect href="/staff/profile" />;
  }

  if (loading && !refreshing) {
    return (
      <View style={local.centre}>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={local.centre}>
        <ErrorState message={t('analytics.networkError')} onRetry={load} />
      </View>
    );
  }

  // "No data yet": total 0 means an empty (or freshly seeded) deployment. Show a
  // friendly line rather than a page of empty bars.
  const isEmpty = !analytics || analytics.total === 0;

  // Status / case type: fixed, known order from the shared constants so the bars
  // are stable across renders and locales. Localise each label via t().
  const statusBars = analytics
    ? CASE_STATUSES.map((v) => ({
        key: v,
        label: t(`statuses.${v}`),
        count: analytics.by_status[v] ?? 0,
      }))
    : [];

  const caseTypeBars = analytics
    ? CASE_TYPES.map((v) => ({
        key: v,
        label: t(`caseTypes.${v}`),
        count: analytics.by_case_type[v] ?? 0,
      }))
    : [];

  // Districts: server returns only non-zero districts (an object). Sort by count
  // desc and cap to MAX_DISTRICT_BARS. District names are proper nouns — not
  // translated (consistent with the reports list, which shows item.district raw).
  const districtBars = analytics
    ? Object.entries(analytics.by_district)
        .map(([key, count]) => ({ key, label: key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_DISTRICT_BARS)
    : [];

  // Recent volume: already oldest → newest from the server; label with the raw
  // 'YYYY-MM' month key.
  const monthBars = analytics
    ? analytics.recent_by_month.map((m) => ({
        key: m.month,
        label: m.month,
        count: m.count,
      }))
    : [];

  return (
    <View style={local.screen}>
      <StaffHeader title={t('analytics.title')} />
      <ScrollView
        contentContainerStyle={local.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
      {/* Prominent total-cases figure. */}
      <View style={local.totalCard}>
        <Text style={local.totalNumber} accessibilityRole="header">
          {analytics ? analytics.total : 0}
        </Text>
        <Text style={local.totalLabel}>{t('analytics.total')}</Text>
      </View>

      {isEmpty ? (
        <Text style={local.emptyText}>{t('analytics.empty')}</Text>
      ) : (
        <>
          <BarSection title={t('analytics.byStatus')} bars={statusBars} />
          <BarSection title={t('analytics.byCaseType')} bars={caseTypeBars} />
          {districtBars.length > 0 ? (
            <BarSection title={t('analytics.byDistrict')} bars={districtBars} />
          ) : null}
          <BarSection title={t('analytics.recentVolume')} bars={monthBars} />
        </>
      )}
      </ScrollView>
    </View>
  );
}

type Bar = { key: string; label: string; count: number };

/**
 * A titled group of horizontal bars. Each bar's width is proportional to the
 * MAX count in this section (never across sections — otherwise a huge status
 * count would flatten the month bars). A zero-count row still renders a labelled
 * empty track, so empty categories stay visible and accessible.
 */
function BarSection({ title, bars }: { title: string; bars: Bar[] }) {
  // Guard against divide-by-zero when every count is 0 (all-empty section).
  const max = Math.max(1, ...bars.map((b) => b.count));

  return (
    <View style={local.section}>
      <Text style={local.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {bars.map((bar) => {
        const fraction = bar.count / max;
        return (
          <View
            key={bar.key}
            style={local.barRow}
            accessible
            accessibilityLabel={`${bar.label}: ${bar.count}`}
          >
            <Text style={local.barLabel} numberOfLines={1}>
              {bar.label}
            </Text>
            <View style={local.barTrack}>
              {/* flex is the proportion; a tiny minimum keeps a >0 bar visible. */}
              <View
                style={[
                  local.barFill,
                  { flex: bar.count === 0 ? 0 : Math.max(fraction, 0.02) },
                ]}
              />
              <View style={{ flex: bar.count === 0 ? 1 : 1 - Math.max(fraction, 0.02) }} />
            </View>
            <Text style={local.barCount}>{bar.count}</Text>
          </View>
        );
      })}
    </View>
  );
}

const local = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  totalCard: {
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    marginBottom: 24,
  },
  totalNumber: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.primary,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  barLabel: {
    width: 110,
    fontSize: 13,
    color: colors.text,
    marginRight: 8,
  },
  barTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  barCount: {
    width: 36,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginLeft: 8,
  },
});
