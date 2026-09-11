/**
 * JusticeNow (mobile) — Admin Organisations list. Route: /staff/admin/organisations.
 *
 * Lists ALL legal-aid organisations (active AND inactive, the latter with a
 * badge) for admins to manage. Each row opens the editor at
 * /staff/admin/organisation/[id]; a "New" button opens it in create mode
 * (/staff/admin/organisation/new).
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff").
 * fetchAllOrganisations goes through the token-bearing staffApi against the
 * admin-guarded GET /organisations/all; the server is the real boundary. The
 * `!isAdmin` Redirect is UX. A 401 means the in-memory token expired → log out
 * and bounce to login (the same leave-no-trace path the other staff screens use).
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
import { fetchAllOrganisations } from '../../../src/api/client';
import type { AdminOrganisation } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { colors } from '../../../src/theme';

export default function AdminOrganisationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [orgs, setOrgs] = useState<AdminOrganisation[]>([]);
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
      const res = await fetchAllOrganisations();
      setOrgs(res.data.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      setFailed(true);
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, [goToLogin]);

  // Reload on focus (this also covers the first mount) so a create/edit/
  // deactivate on the editor screen is reflected when the admin navigates back.
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
            {t('adminOrg.listTitle')}
          </Text>
          <Pressable
            onPress={() => router.push('/staff/admin/organisation/new')}
            style={local.newBtn}
            accessibilityRole="button"
            accessibilityLabel={t('adminOrg.new')}
          >
            <Text style={local.newBtnText}>＋ {t('adminOrg.new')}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={local.centre}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : failed ? (
        <View style={local.centre}>
          <ErrorState message={t('adminOrg.networkError')} onRetry={load} />
        </View>
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={local.list}
          renderItem={({ item }) => (
            <OrgRow
              org={item}
              onPress={() => router.push(`/staff/admin/organisation/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={local.centre}>
              <Text style={local.emptyText}>{t('adminOrg.empty')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

/** One organisation row: name, district, and an "inactive" badge when off. */
function OrgRow({
  org,
  onPress,
}: {
  org: AdminOrganisation;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Pressable
      style={local.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${org.name}. ${org.district}. ${
        org.is_active ? t('adminOrg.active') : t('adminOrg.inactive')
      }`}
    >
      <View style={local.rowMain}>
        <Text style={local.rowName}>{org.name}</Text>
        <Text style={local.rowDistrict}>{org.district}</Text>
      </View>
      {org.is_active ? null : (
        <View style={local.badge}>
          <Text style={local.badgeText}>{t('adminOrg.inactive')}</Text>
        </View>
      )}
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
  rowDistrict: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.primaryTint,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  chevron: {
    fontSize: 24,
    color: colors.muted,
  },
});
