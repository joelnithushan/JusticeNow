/**
 * JusticeNow (mobile) — Admin approvals. Route: /staff/admin/approvals.
 *
 * ADMIN-ONLY. Lists accounts awaiting a decision (access_status 'pending' or, if
 * still finishing onboarding, 'onboarding') and shows each one's login email, the
 * profile details they submitted, and whether 2FA is on — then Approve (grant case
 * access) or Reject (block login). The server guards every endpoint + re-checks the
 * role, so this screen is the UX layer over POST /staff/:id/approve|reject.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import axios from 'axios';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import StaffHeader from '../../../components/StaffHeader';
import ErrorState from '../../../components/ErrorState';
import {
  fetchStaff,
  fetchStaffMember,
  approveStaffMember,
  rejectStaffMember,
} from '../../../src/api/client';
import type { StaffMemberDetail } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { colors, styles as theme } from '../../../src/theme';

export default function AdminApprovals() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin, logout } = useAuth();

  const [items, setItems] = useState<StaffMemberDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const goToLogin = useCallback(() => { logout(); router.replace('/staff/login'); }, [logout, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetchStaff();
      // Accounts needing a decision: submitted (pending) first, then still onboarding.
      const waiting = res.data.data.filter(
        (s) => s.access_status === 'pending' || s.access_status === 'onboarding',
      );
      // Pull full detail (submitted fields + 2FA) for each.
      const details = await Promise.all(
        waiting.map((s) => fetchStaffMember(s.id).then((r) => r.data.data).catch(() => null)),
      );
      const clean = details.filter(Boolean) as StaffMemberDetail[];
      clean.sort((a, b) => (a.access_status === 'pending' ? -1 : 1) - (b.access_status === 'pending' ? -1 : 1));
      setItems(clean);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return goToLogin();
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [goToLogin]);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(
    (member: StaffMemberDetail, approve: boolean) => {
      Alert.alert(
        approve ? t('approvals.approveTitle') : t('approvals.rejectTitle'),
        (approve ? t('approvals.approveConfirm') : t('approvals.rejectConfirm')).replace('{name}', member.name),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: approve ? t('approvals.approve') : t('approvals.reject'),
            style: approve ? 'default' : 'destructive',
            onPress: async () => {
              setActingId(member.id);
              try {
                if (approve) await approveStaffMember(member.id);
                else await rejectStaffMember(member.id);
                await load();
              } catch (err) {
                if (axios.isAxiosError(err) && err.response?.status === 401) return goToLogin();
                Alert.alert(t('approvals.actionFailed'));
              } finally {
                setActingId(null);
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [t, load, goToLogin],
  );

  if (!isAdmin) return <Redirect href="/staff/reports" />;

  return (
    <View style={local.screen}>
      <StaffHeader title={t('approvals.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      {loading ? (
        <View style={local.center}><ActivityIndicator color={colors.primary} /></View>
      ) : failed ? (
        <ErrorState message={t('approvals.loadFailed')} onRetry={load} />
      ) : items.length === 0 ? (
        <View style={local.center}><Text style={local.empty}>{t('approvals.empty')}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={theme.page} showsVerticalScrollIndicator={false}>
          {items.map((m) => (
            <View key={m.id} style={local.card}>
              <View style={local.rowBetween}>
                <Text style={local.name}>{m.name}</Text>
                <View style={[local.badge, m.access_status === 'pending' ? local.badgePending : local.badgeOnboarding]}>
                  <Text style={local.badgeText}>{t(`approvals.status.${m.access_status}`)}</Text>
                </View>
              </View>
              <Text style={local.email}>{m.email}</Text>

              <View style={local.detailGrid}>
                <Detail label={t('staffRegister.role')} value={m.role ? t(`roles.${m.role}`, { defaultValue: m.role }) : '—'} />
                <Detail label={t('staffRegister.organisation')} value={m.organisation_name || '—'} />
                <Detail label={t('profile.nic')} value={m.nic || '—'} />
                <Detail label={t('profile.phone')} value={m.phone || '—'} />
                <Detail label={t('profile.designation')} value={m.designation || '—'} />
                {m.role === 'attorney' ? <Detail label={t('profile.barNumber')} value={m.bar_number || '—'} /> : null}
                {m.role === 'officer' ? <Detail label={t('staffRegister.department')} value={m.department || '—'} /> : null}
                <Detail label={t('mfa.mfaTitle')} value={m.mfa_enabled ? t('approvals.on') : t('approvals.off')} />
              </View>

              <View style={local.actions}>
                <Pressable
                  onPress={() => decide(m, false)}
                  disabled={actingId === m.id}
                  style={[local.rejectBtn, actingId === m.id && theme.btnDisabled]}
                  accessibilityRole="button"
                >
                  <Text style={local.rejectText}>{t('approvals.reject')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => decide(m, true)}
                  disabled={actingId === m.id}
                  style={[local.approveBtn, actingId === m.id && theme.btnDisabled]}
                  accessibilityRole="button"
                >
                  {actingId === m.id ? (
                    <ActivityIndicator color={colors.primaryText} />
                  ) : (
                    <Text style={local.approveText}>{t('approvals.approve')}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={local.detail}>
      <Text style={local.detailLabel}>{label}</Text>
      <Text style={local.detailValue}>{value}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    backgroundColor: colors.background,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  email: { fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgePending: { backgroundColor: colors.secondaryTint },
  badgeOnboarding: { backgroundColor: colors.primaryTint },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.text },
  detailGrid: { gap: 8, marginBottom: 14 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 10 },
  approveBtn: {
    flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  approveText: { color: colors.primaryText, fontSize: 15, fontWeight: '700' },
  rejectBtn: {
    flex: 1, backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.danger,
    paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  rejectText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
});
