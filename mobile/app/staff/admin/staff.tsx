/**
 * JusticeNow (mobile) — Admin Staff list. Route: /staff/admin/staff.
 *
 * Lists ALL staff accounts (active AND inactive, the latter with a badge) for
 * admins to manage. Each row shows name, email, a role badge, and the org name;
 * tapping opens the editor at /staff/admin/staff-member/[id]. A "New" button
 * opens it in create mode (/staff/admin/staff-member/new).
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff").
 * fetchStaff goes through the token-bearing staffApi against the admin-guarded
 * GET /staff; the server is the real boundary. The `!isAdmin` Redirect is UX. A
 * 401 means the in-memory token expired → log out and bounce to login.
 *
 * PRIVACY: staff accounts are NOT reporters — there is no anonymity concern
 * about staff rows. The server never sends a password_hash and this screen never
 * renders or stores one.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import axios from 'axios';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ErrorState from '../../../components/ErrorState';
import BackButton from '../../../components/BackButton';
import { fetchStaff } from '../../../src/api/client';
import type { StaffMember } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { colors } from '../../../src/theme';

export default function AdminStaffScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const goToLogin = useCallback(() => {
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetchStaff();
      setStaff(res.data.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      setFailed(true);
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [goToLogin]);

  // Reload on focus (covers first mount too) so a create/edit/deactivate on the
  // editor screen is reflected when the admin navigates back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!isAdmin) {
    return <Redirect href="/staff/reports" />;
  }

  return (
    <View style={[local.screen, { paddingTop: insets.top }]}>
      <View style={local.header}>
        <BackButton onPress={() => router.back()} label={t('common.back')} />
        <View style={local.titleRow}>
          <Text style={local.title} accessibilityRole="header">
            {t('adminStaff.listTitle')}
          </Text>
          <Pressable
            onPress={() => router.push('/staff/admin/staff-member/new')}
            style={local.newBtn}
            accessibilityRole="button"
            accessibilityLabel={t('adminStaff.new')}
          >
            <Text style={local.newBtnText}>＋ {t('adminStaff.new')}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={local.centre}>
          <ActivityIndicator
            color={colors.primary}
            accessibilityLabel={t('common.loading')}
          />
        </View>
      ) : failed ? (
        <View style={local.centre}>
          <ErrorState message={t('adminStaff.networkError')} onRetry={load} />
        </View>
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(item) => item.id}
          contentContainerStyle={local.list}
          renderItem={({ item }) => (
            <StaffRow
              member={item}
              onPress={() => router.push(`/staff/admin/staff-member/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={local.centre}>
              <Text style={local.emptyText}>{t('adminStaff.empty')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

/** One staff row: name, email, a role badge, org name, and an inactive badge. */
function StaffRow({ member, onPress }: { member: StaffMember; onPress: () => void }) {
  const { t } = useTranslation();
  const roleLabel = t(`roles.${member.role}`);

  return (
    <Pressable
      style={local.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${member.name}. ${member.email}. ${roleLabel}. ${
        member.organisation_name ?? ''
      }. ${member.is_active ? t('adminStaff.active') : t('adminStaff.inactive')}`}
    >
      <View style={local.rowMain}>
        <Text style={local.rowName}>{member.name}</Text>
        <Text style={local.rowEmail}>{member.email}</Text>
        {member.organisation_name ? (
          <Text style={local.rowOrg}>{member.organisation_name}</Text>
        ) : null}
      </View>
      <View style={local.badges}>
        <View style={local.roleBadge}>
          <Text style={local.roleBadgeText}>{roleLabel}</Text>
        </View>
        {member.is_active ? null : (
          <View style={local.inactiveBadge}>
            <Text style={local.inactiveBadgeText}>{t('adminStaff.inactive')}</Text>
          </View>
        )}
      </View>
      <Text style={local.chevron}>›</Text>
    </Pressable>
  );
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    flexShrink: 1,
    marginRight: 8,
  },
  newBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  newBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryText,
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: 12,
  },
  rowMain: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  rowEmail: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  rowOrg: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  badges: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  roleBadge: {
    backgroundColor: colors.primaryTint,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  inactiveBadge: {
    backgroundColor: colors.primaryTint,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  inactiveBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  chevron: {
    fontSize: 24,
    color: colors.muted,
  },
});
