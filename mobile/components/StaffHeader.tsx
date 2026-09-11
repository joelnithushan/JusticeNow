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
import { colors } from '../src/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Small count pill shown next to the title (e.g. number of cases). */
  badge?: string;
  /** When provided, renders a sign-out button on the right. */
  onSignOut?: () => void;
  signOutLabel?: string;
};

export default function StaffHeader({ title, subtitle, badge, onSignOut, signOutLabel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <View style={styles.main}>
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
  main: { flex: 1, marginRight: 12 },
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
