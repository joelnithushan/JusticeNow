/**
 * JusticeNow (mobile) — Staff Admin HUB (admin-only). Route: /staff/admin.
 *
 * The landing screen for admin-only management. It links out to:
 *  - Organisations (U10, /staff/admin/organisations) — org CRUD.
 *  - Staff (U11, /staff/admin/staff) — staff CRUD (built in a later unit; the
 *    link is placed now and will resolve once that screen exists).
 *  - Audit trail (U9, /staff/audit) — the append-only trail of staff actions.
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff" is
 * admin). The tab is already hidden for non-admins in the tab layout (href:
 * null), and the server guards every admin endpoint with requireStaff +
 * requireRole('admin'). The `!isAdmin` Redirect below is defence-in-depth / UX:
 * it keeps a non-admin who somehow reaches this route from landing here.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import StaffHeader from '../../../components/StaffHeader';
import { useAuth } from '../../../src/context/AuthContext';
import { useProfile } from '../../../src/context/ProfileContext';
import { colors, styles as theme } from '../../../src/theme';

export default function StaffAdminTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { profile } = useProfile();

  // Completion gate: an incomplete profile must finish first. Checked before the
  // admin check so an incomplete admin still lands on the profile screen.
  if (profile && profile.profile_completed === false) {
    return <Redirect href="/staff/profile" />;
  }

  // Non-admins never manage orgs/staff. The server is the real boundary; this
  // Redirect is UX so they land back on a screen they can use.
  if (!isAdmin) {
    return <Redirect href="/staff/reports" />;
  }

  const items: { key: string; label: string; href: string }[] = [
    {
      key: 'organisations',
      label: t('admin.organisations'),
      href: '/staff/admin/organisations',
    },
    { key: 'staff', label: t('admin.staff'), href: '/staff/admin/staff' },
    { key: 'audit', label: t('admin.auditTrail'), href: '/staff/audit' },
  ];

  return (
    <View style={local.screen}>
      <StaffHeader title={t('admin.title')} />
      <ScrollView contentContainerStyle={theme.page}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => router.push(item.href)}
          style={local.link}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <Text style={local.linkText}>{item.label}</Text>
          <Text style={local.chevron}>›</Text>
        </Pressable>
      ))}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginTop: 8,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  chevron: {
    fontSize: 24,
    color: colors.muted,
    marginLeft: 8,
  },
});
