/**
 * JusticeNow (mobile) — Staff dashboard header (brand-blue app bar).
 *
 * A consistent blue header for the staff tab screens (Reports, Analytics, Admin,
 * Profile), matching the reporter-facing pages. Extends up behind the status bar
 * via the top safe-area inset. Optional count badge (e.g. the reports total),
 * subtitle (e.g. the organisation name), and a sign-out action.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import BrandLogo from './BrandLogo';
import { colors } from '../src/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Small count pill shown next to the title (e.g. number of cases). */
  badge?: string;
  /** When provided, renders a back button on the left (e.g. for pushed screens). */
  onBack?: () => void;
  backLabel?: string;
  /** When provided, renders a sign-out button on the right. */
  onSignOut?: () => void;
  signOutLabel?: string;
};

export default function StaffHeader({
  title,
  subtitle,
  badge,
  onBack,
  backLabel,
  onSignOut,
  signOutLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      {/* Optional back control (top-left), then the brand mark — consistent with the
          reporter app bar. Tab roots pass no onBack, so they show no back. */}
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={styles.back}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={backLabel || 'Back'}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 6 l-6 6 l6 6" stroke={colors.primaryText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
      ) : null}
      <BrandLogo size={30} tintColor={colors.primaryText} accessibilityLabel="JusticeNow" />
      <View style={[styles.main, styles.mainWithLogo]}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {badge != null ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onSignOut ? (
        <Pressable
          onPress={onSignOut}
          style={styles.signOut}
          accessibilityRole="button"
          accessibilityLabel={signOutLabel}
        >
          <Text style={styles.signOutText}>{signOutLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: colors.primary,
  },
  back: {
    marginRight: 10,
    marginLeft: -4,
    height: 34,
    width: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  main: { flex: 1, marginRight: 12 },
  mainWithLogo: { marginLeft: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '800', color: colors.primaryText, flexShrink: 1 },
  badge: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  subtitle: { marginTop: 2, fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  signOut: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  signOutText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});
