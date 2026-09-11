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
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../src/context/AuthContext';
import { useProfile } from '../../../src/context/ProfileContext';
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

// Analytics: three bars.
function AnalyticsIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={12} width={4} height={8} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Rect x={10} y={8} width={4} height={12} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Rect x={16} y={4} width={4} height={16} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

// Admin: a gear-ish cog (circle + spokes).
function AdminIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} />
      <Line x1={12} y1={2} x2={12} y2={5} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={12} y1={19} x2={12} y2={22} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={2} y1={12} x2={5} y2={12} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={19} y1={12} x2={22} y2={12} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Profile tab icon: the staffer's avatar (small circular image) when they have
// one, else a person glyph. This IS the "avatar in the nav bar" — tapping it
// opens the profile. The active/inactive tint colours the placeholder glyph.
function ProfileTabIcon({
  color,
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
  return (
    <View style={local.avatarPlaceholder}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={1.8} />
        <Path
          d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
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

  // Completion gate: once the profile has loaded and is INCOMPLETE, the other
  // tabs are hidden (href: null) so the staffer cannot leave the profile screen
  // until they finish it. The profile tab itself always stays reachable, and a
  // successful save flips profile_completed → the tabs unlock on the next render.
  // While the profile is still loading (null) we do NOT hide anything, so a slow
  // fetch never traps a staffer whose profile is actually complete.
  const gated = profile !== null && profile.profile_completed === false;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="reports"
        options={{
          title: t('staffTabs.reports'),
          tabBarIcon: ({ color }) => <ReportsIcon color={color} />,
          href: gated ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t('staffTabs.analytics'),
          tabBarIcon: ({ color }) => <AnalyticsIcon color={color} />,
          href: gated ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: t('staffTabs.admin'),
          tabBarIcon: ({ color }) => <AdminIcon color={color} />,
          // Hide the Admin tab for non-admins OR while the profile gate is active.
          // The route still exists; real enforcement is server-side.
          href: isAdmin && !gated ? undefined : null,
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
