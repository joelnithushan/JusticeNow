/**
 * JusticeNow (mobile) — Awaiting-approval screen. Route: /staff/pending.
 *
 * Shown to a staff account that has finished onboarding (profile + 2FA) and been
 * submitted for admin approval (access_status = 'pending'). The account can log in
 * but has NO case access until an admin approves it (the server enforces this).
 * A "Check status" button re-fetches the profile — once approved, it forwards to
 * the dashboard; otherwise it stays here. Sign-out is always available.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import BrandLogo from '../../components/BrandLogo';
import { useAuth } from '../../src/context/AuthContext';
import { useProfile } from '../../src/context/ProfileContext';
import { colors, styles as theme } from '../../src/theme';

export default function PendingApproval() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { profile, refresh } = useProfile();
  const [checking, setChecking] = useState(false);

  const onCheck = async () => {
    if (checking) return;
    setChecking(true);
    await refresh();
    setChecking(false);
    // The refreshed profile drives the route: approved → dashboard.
  };

  // Once approved (after a refresh), leave for the dashboard — declaratively, so we
  // never call navigation during render.
  if (profile && profile.access_status === 'approved') {
    return <Redirect href="/staff/reports" />;
  }

  const signOut = () => {
    logout();
    router.replace('/staff/login');
  };

  return (
    <View style={local.screen}>
      <StatusBar style="light" />
      <View style={[local.appbar, { paddingTop: insets.top + 10 }]}>
        <BrandLogo size={30} tintColor={colors.primaryText} accessibilityLabel={t('app.title')} />
        <Text style={local.wordmark}>{t('app.title')}</Text>
      </View>

      <View style={local.body}>
        <View style={local.badge}>
          <Text style={local.badgeIcon}>⏳</Text>
        </View>
        <Text style={local.title} accessibilityRole="header">{t('pending.title')}</Text>
        <Text style={local.message}>{t('pending.message')}</Text>

        {/* What the staffer has completed, for reassurance. */}
        <View style={local.checks}>
          <Text style={local.check}>{'✓ ' + t('pending.profileDone')}</Text>
          <Text style={local.check}>{'✓ ' + t('pending.twoFaDone')}</Text>
        </View>

        <Pressable
          onPress={onCheck}
          disabled={checking}
          style={[theme.btnPrimary, local.btn, checking && theme.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('pending.checkStatus')}
        >
          {checking ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={theme.btnPrimaryText}>{t('pending.checkStatus')}</Text>
          )}
        </Pressable>

        <Pressable onPress={signOut} style={theme.btnLink} accessibilityRole="button">
          <Text style={theme.btnLinkText}>{t('staffReports.signOut')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.primary,
  },
  wordmark: { fontSize: 20, fontWeight: '800', color: colors.primaryText, letterSpacing: 0.3 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  badgeIcon: { fontSize: 34 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  checks: { alignSelf: 'stretch', backgroundColor: colors.primaryTint, borderRadius: 12, padding: 16, marginBottom: 24 },
  check: { fontSize: 14, fontWeight: '700', color: colors.primary, paddingVertical: 3 },
  btn: { alignSelf: 'stretch' },
});
