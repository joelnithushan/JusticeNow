/**
 * JusticeNow (mobile) — Public transparency dashboard.
 *
 * Open to everyone (no auth). Shows ANONYMISED aggregate figures only — the
 * server sends pure counts (see server/services/transparencyService.js), and
 * there is no reporter identity anywhere in the data. Accountability is the
 * heart of SDG 16, so these numbers are public by design.
 *
 * All strings go through t(); styling comes from theme tokens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import ReporterTopBar from '../components/ReporterTopBar';
import ErrorState from '../components/ErrorState';
import { fetchTransparency } from '../src/api/client';
import type { TransparencyStats } from '../src/api/client';
import { CASE_STATUSES, CASE_TYPES } from '../src/constants';
import { colors, styles as theme } from '../src/theme';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM' → short month label (e.g. 'Sep'). Falls back to the raw key.
function monthLabel(key: string): string {
  const m = Number(key.split('-')[1]);
  return m >= 1 && m <= 12 ? MONTHS_SHORT[m - 1] : key;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Transparency() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<TransparencyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setLoading(true);
    try {
      const res = await fetchTransparency();
      setStats(res.data.data);
    } catch {
      // Aggregate counts only — nothing sensitive to log.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={local.screen}>
      <ReporterTopBar title={t('transparency.title')} />
      {loading ? (
        <View style={local.centre}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : failed || !stats ? (
        <View style={local.centre}>
          <ErrorState message={t('transparency.loadFailed')} onRetry={load} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={local.body} showsVerticalScrollIndicator={false}>
          <Text style={local.subtitle}>{t('transparency.subtitle')}</Text>

          {/* Headline stat cards. */}
          <View style={local.cardsRow}>
            <StatCard value={String(stats.total)} label={t('transparency.totalCases')} />
            <StatCard
              value={`${Math.round(stats.resolution_rate * 100)}%`}
              label={t('transparency.resolutionRate')}
              accent
            />
          </View>
          <View style={local.cardsRow}>
            <StatCard value={String(stats.resolved)} label={t('transparency.resolved')} />
            <StatCard value={String(stats.organisations)} label={t('transparency.organisations')} />
          </View>

          {stats.total === 0 ? (
            <Text style={local.empty}>{t('transparency.empty')}</Text>
          ) : (
            <>
              {/* Where cases stand (by status). */}
              <Section title={t('transparency.byStatus')}>
                <BarList
                  items={CASE_STATUSES.map((s) => ({
                    key: s,
                    label: t(`statuses.${s}`),
                    value: stats.by_status[s] || 0,
                  }))}
                />
              </Section>

              {/* By type of concern. */}
              <Section title={t('transparency.byType')}>
                <BarList
                  items={CASE_TYPES.map((c) => ({
                    key: c,
                    label: t(`caseTypes.${c}`),
                    value: stats.by_case_type[c] || 0,
                  }))}
                />
              </Section>

              {/* By district (server sends only non-zero districts). */}
              {Object.keys(stats.by_district).length > 0 ? (
                <Section title={t('transparency.byDistrict')}>
                  <BarList
                    items={Object.entries(stats.by_district)
                      .sort((a, b) => b[1] - a[1])
                      .map(([d, v]) => ({ key: d, label: d, value: v }))}
                  />
                </Section>
              ) : null}

              {/* 6-month trend as a mini column chart. */}
              <Section title={t('transparency.trend')}>
                <MonthlyChart data={stats.recent_by_month} />
              </Section>
            </>
          )}

          <Text style={local.asOf}>
            {t('transparency.asOf', { date: formatDate(stats.generated_at) })}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={[local.card, accent && local.cardAccent]}>
      <Text style={[local.cardValue, accent && local.cardValueAccent]}>{value}</Text>
      <Text style={local.cardLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={local.section}>
      <Text style={local.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// A list of labelled proportion bars. Each bar's fill is scaled to the largest
// value in the set, so the tallest category fills the track.
function BarList({ items }: { items: { key: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <View>
      {items.map((item) => (
        <View key={item.key} style={local.barRow}>
          <Text style={local.barLabel} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={local.barTrack}>
            <View style={[local.barFill, { width: `${(item.value / max) * 100}%` }]} />
          </View>
          <Text style={local.barValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

// Simple vertical column chart for the monthly trend.
function MonthlyChart({ data }: { data: { month: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <View style={local.chart}>
      {data.map((d) => (
        <View key={d.month} style={local.chartCol}>
          <Text style={local.chartValue}>{d.count}</Text>
          <View style={local.chartBarTrack}>
            <View style={[local.chartBar, { height: `${(d.count / max) * 100}%` }]} />
          </View>
          <Text style={local.chartMonth}>{monthLabel(d.month)}</Text>
        </View>
      ))}
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 20, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 16 },

  cardsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  cardAccent: { backgroundColor: colors.primaryTint, borderColor: colors.primaryTint },
  cardValue: { fontSize: 30, fontWeight: '800', color: colors.text },
  cardValueAccent: { color: colors.primary },
  cardLabel: { fontSize: 13, color: colors.muted, marginTop: 4, fontWeight: '600' },

  section: { marginTop: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },
  empty: { marginTop: 24, fontSize: 15, color: colors.muted, textAlign: 'center' },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  barLabel: { width: 120, fontSize: 13, color: colors.text },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primaryTint,
    overflow: 'hidden',
  },
  barFill: { height: 12, borderRadius: 6, backgroundColor: colors.primary },
  barValue: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text },

  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    gap: 8,
  },
  chartCol: { flex: 1, alignItems: 'center' },
  chartValue: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  chartBarTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: '70%', minHeight: 3, borderRadius: 6, backgroundColor: colors.primary },
  chartMonth: { fontSize: 12, color: colors.muted, marginTop: 6 },

  asOf: { marginTop: 24, fontSize: 12, color: colors.muted, textAlign: 'center' },
});
