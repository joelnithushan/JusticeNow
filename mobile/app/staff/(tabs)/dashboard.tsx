/**
 * JusticeNow (mobile) — Staff Dashboard (first tab).
 *
 * The staff landing screen. Combines an at-a-glance SNAPSHOT (aggregate counts
 * only — total + status breakdown, same anonymity guarantee as the analytics
 * tab) with the admin MANAGEMENT shortcuts (admins only). A "view detailed
 * analytics" link opens the full analytics screen.
 *
 * ANONYMITY: everything shown is an AGGREGATE COUNT from /api/analytics — no
 * rows, ids, reference codes, narrative or reporter identity (see analytics.tsx).
 *
 * AUTH: fetched through the token-bearing staffApi. A 401 means the in-memory
 * token expired (never persisted) → log out and bounce to /staff/login. Admin
 * shortcuts are a UX affordance; the server guards every admin endpoint.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import axios from 'axios';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import ErrorState from '../../../components/ErrorState';
import StaffHeader from '../../../components/StaffHeader';
import { fetchAnalytics } from '../../../src/api/client';
import type { Analytics } from '../../../src/api/client';
import { CASE_STATUSES } from '../../../src/constants';
import { useAuth } from '../../../src/context/AuthContext';
import { useProfile } from '../../../src/context/ProfileContext';
import { colors, styles as theme } from '../../../src/theme';

// ── Management shortcut icons (navy on a tinted disc) ───────────────────────
type IconProps = { color: string };
function ApprovalsIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.9} />
    </Svg>
  );
}
function OrganisationsIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={9} height={16} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Path d="M13 9h6a1.5 1.5 0 011.5 1.5V20M7 8h3M7 12h3M7 16h3M16 13h1.5M16 16h1.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
function StaffIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3.2} stroke={color} strokeWidth={1.8} />
      <Path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M16 6.2a3 3 0 010 5.6M17.5 14.2c2.3.5 4 2.4 4 4.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function AuditIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={3} width={14} height={18} rx={2} stroke={color} strokeWidth={1.8} />
      <Path d="M9 8h6M9 12h6M9 16h4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function Chevron() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function StaffDashboardTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout, isAdmin } = useAuth();
  const { profile } = useProfile();

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

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
      // Never log — even aggregate payloads stay out of logs.
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

  // Completion gate: an incomplete profile must finish first.
  if (profile && profile.profile_completed === false) {
    return <Redirect href="/staff/profile" />;
  }

  const adminItems: { key: string; label: string; href: string; Icon: (p: IconProps) => React.ReactElement }[] = [
    { key: 'approvals', label: t('admin.approvals'), href: '/staff/admin/approvals', Icon: ApprovalsIcon },
    { key: 'organisations', label: t('admin.organisations'), href: '/staff/admin/organisations', Icon: OrganisationsIcon },
    { key: 'staff', label: t('admin.staff'), href: '/staff/admin/staff', Icon: StaffIcon },
    { key: 'audit', label: t('admin.auditTrail'), href: '/staff/audit', Icon: AuditIcon },
  ];

  // Status snapshot: fixed order from shared constants so bars are stable.
  const statusBars = analytics
    ? CASE_STATUSES.map((v) => ({ key: v, label: t(`statuses.${v}`), count: analytics.by_status[v] ?? 0 }))
    : [];
  const maxStatus = Math.max(1, ...statusBars.map((b) => b.count));
  const isEmpty = !analytics || analytics.total === 0;

  return (
    <View style={local.screen}>
      <StaffHeader
        title={t('dashboard.title')}
        subtitle={profile?.organisation_name ?? undefined}
      />
      {loading && !refreshing ? (
        <View style={local.centre}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : failed ? (
        <View style={local.centre}>
          <ErrorState message={t('analytics.networkError')} onRetry={load} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={local.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {/* ── Snapshot (simple analytics) ── */}
          <Text style={local.sectionTitle}>{t('dashboard.snapshot')}</Text>
          <View style={local.totalCard}>
            <Text style={local.totalNumber} accessibilityRole="header">
              {analytics ? analytics.total : 0}
            </Text>
            <Text style={local.totalLabel}>{t('analytics.total')}</Text>
          </View>

          {isEmpty ? (
            <Text style={local.emptyText}>{t('analytics.empty')}</Text>
          ) : (
            <View style={local.statusCard}>
              {statusBars.map((bar) => (
                <View key={bar.key} style={local.barRow} accessible accessibilityLabel={`${bar.label}: ${bar.count}`}>
                  <Text style={local.barLabel} numberOfLines={1}>{bar.label}</Text>
                  <View style={local.barTrack}>
                    <View style={[local.barFill, { flex: bar.count === 0 ? 0 : Math.max(bar.count / maxStatus, 0.02) }]} />
                    <View style={{ flex: bar.count === 0 ? 1 : 1 - Math.max(bar.count / maxStatus, 0.02) }} />
                  </View>
                  <Text style={local.barCount}>{bar.count}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            style={local.analyticsLink}
            onPress={() => router.push('/staff/analytics')}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.viewAnalytics')}
          >
            <Text style={local.analyticsLinkText}>{t('dashboard.viewAnalytics')}</Text>
            <Chevron />
          </Pressable>

          {/* ── Management (admins only) ── */}
          {isAdmin ? (
            <>
              <Text style={[local.sectionTitle, local.sectionTitleSpaced]}>{t('dashboard.manage')}</Text>
              {adminItems.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => router.push(item.href)}
                  style={local.link}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <View style={local.iconDisc}><item.Icon color={colors.primary} /></View>
                  <Text style={local.linkText}>{item.label}</Text>
                  <Chevron />
                </Pressable>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 40 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },
  sectionTitleSpaced: { marginTop: 28 },

  totalCard: {
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 14,
    backgroundColor: colors.primaryTint,
    marginBottom: 16,
  },
  totalNumber: { fontSize: 44, fontWeight: '800', color: colors.primary },
  totalLabel: { fontSize: 14, fontWeight: '600', color: colors.muted, marginTop: 4 },

  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22, marginTop: 8 },

  statusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  barLabel: { width: 100, fontSize: 13, color: colors.text, marginRight: 8 },
  barTrack: { flex: 1, flexDirection: 'row', height: 14, borderRadius: 7, backgroundColor: colors.primaryTint, overflow: 'hidden' },
  barFill: { backgroundColor: colors.primary, borderRadius: 7 },
  barCount: { width: 32, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text, marginLeft: 8 },

  analyticsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analyticsLinkText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  link: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginTop: 10,
  },
  iconDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  linkText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
});
