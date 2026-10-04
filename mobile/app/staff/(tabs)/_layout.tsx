/**
 * JusticeNow (mobile) — Staff bottom-tab navigator (Reports · Analytics · Admin).
 *
 * AUTH GUARD: staff-only. If the session is not authenticated we redirect to
 * /staff/login. Reporters never reach here (they never authenticate), and the
 * token lives in memory only (see AuthContext) so a cold start bounces back to
 * login — intended, leave-no-trace behaviour.
 *
 * The Admin tab is HIDDEN for non-admins via `href: null` (the route still
 * exists, but no tab button renders). Authorization is ultimately enforced
 * server-side; hiding the tab is a UX affordance, not the security boundary.
 *
 * Tab icons are small inline react-native-svg glyphs — no icon-font/library
 * dependency is added (per the no-new-deps rule). They are monochrome and take
 * the active/inactive tint from the tab bar `color`.
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { ColorValue } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../src/context/AuthContext';
import { useProfile } from '../../../src/context/ProfileContext';
import DefaultAvatar from '../../../components/DefaultAvatar';
import { colors } from '../../../src/theme';

// expo-router's tabBarIcon passes a ColorValue (not always a plain string);
// react-native-svg's stroke prop accepts ColorValue, so we thread it through.
type IconProps = { color: ColorValue };

// Reports: a document with lines.
function ReportsIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 3 h8 l4 4 v14 H6 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Line x1={9} y1={11} x2={15} y2={11} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={9} y1={15} x2={15} y2={15} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Dashboard: a 2×2 grid of rounded cells (the landing/overview tab).
function DashboardIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={7} height={7} rx={1.6} stroke={color} strokeWidth={1.8} />
      <Rect x={13} y={4} width={7} height={7} rx={1.6} stroke={color} strokeWidth={1.8} />
      <Rect x={4} y={13} width={7} height={7} rx={1.6} stroke={color} strokeWidth={1.8} />
      <Rect x={13} y={13} width={7} height={7} rx={1.6} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

// Profile tab icon: the staffer's avatar (small circular image) when they have
// one, else a person glyph. This IS the "avatar in the nav bar" — tapping it
// opens the profile. The active/inactive tint colours the placeholder glyph.
function ProfileTabIcon({
  avatarUrl,
}: IconProps & { avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={local.avatar}
        accessibilityIgnoresInvertColors
      />
    );
  }
  // No photo yet → the shared default avatar (same look as the profile page),
  // so the nav always shows an avatar rather than a bare tinted glyph.
  return (
    <View style={local.avatarPlaceholder}>
      <DefaultAvatar size={26} />
    </View>
  );
}

export default function StaffTabsLayout() {
  const { t } = useTranslation();
  const { isAuthenticated, isAdmin } = useAuth();
  const { profile } = useProfile();

  // Guard: unauthenticated visitors are sent to login before any tab renders.
  if (!isAuthenticated) {
    return <Redirect href="/staff/login" />;
  }

  // ── Onboarding lifecycle gate (non-admins). The system admin is exempt. ──
  // onboarding → complete the profile, then enable 2FA (the server flips the
  // account to 'pending' once both are done); pending → the awaiting-approval
  // screen; approved → the dashboard. The server enforces the same rules, so this
  // is the UX half. While the profile is still loading (null) we gate nothing.
  if (profile !== null && !isAdmin) {
    if (profile.access_status === 'pending') {
      return <Redirect href="/staff/pending" />;
    }
    // Profile complete but 2FA not yet on → enrol 2FA.
    if (
      profile.access_status === 'onboarding' &&
      profile.profile_completed &&
      profile.mfa_enabled === false
    ) {
      return <Redirect href="/staff/mfa-setup" />;
    }
  }

  // Completion gate: while the profile is INCOMPLETE, the other tabs are hidden
  // (href: null) so the staffer must finish the profile first (a Google sign-up
  // also picks their role + organisation here). A successful save flips
  // profile_completed → the tabs unlock on the next render.
  const gated = profile !== null && profile.profile_completed === false;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      {/* Dashboard — the staff landing tab: snapshot analytics + (for admins) the
          management shortcuts that used to live on a separate Admin tab. */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('staffTabs.dashboard'),
          tabBarIcon: ({ color }) => <DashboardIcon color={color} />,
          href: gated ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('staffTabs.reports'),
          tabBarIcon: ({ color }) => <ReportsIcon color={color} />,
          href: gated ? null : undefined,
        }}
      />
      {/* Full analytics — reachable from the Dashboard's "detailed analytics" link,
          so it stays a route but is hidden from the tab bar (href: null). */}
      <Tabs.Screen
        name="analytics"
        options={{
          title: t('staffTabs.analytics'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile.tab'),
          // Avatar in the nav bar → opens the profile. Always reachable, even
          // while the completion gate hides the other tabs.
          tabBarIcon: ({ color }) => (
            <ProfileTabIcon color={color} avatarUrl={profile?.avatar_url ?? null} />
          ),
        }}
      />
    </Tabs>
  );
}

const local = StyleSheet.create({
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryTint,
  },
  avatarPlaceholder: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
});
