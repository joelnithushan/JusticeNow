/**
 * JusticeNow (mobile) — Staff view: list of incoming reports.
 * Ported from /client/src/pages/StaffReports.jsx. Shows case type, district,
 * submission date and status, with a case-type filter. (Auth guard arrives with
 * staff login in a later sprint.)
 *
 * NOTE: the API returns NO reporter identity — by design the case_reports table
 * has no such columns. There is nothing here that could identify a reporter.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Picker } from '@react-native-picker/picker';
import { fetchReports } from '../../src/api/client';
import { CASE_TYPES } from '../../src/constants';
import { colors, styles as theme } from '../../src/theme';

interface ReportRow {
  id: string;
  reference_code: string;
  case_type: string;
  district: string;
  status: string;
  created_at: string;
}

export default function StaffReports() {
  const { t } = useTranslation();

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reload whenever the filter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchReports({ caseType: typeFilter })
      .then((res) => {
        if (!cancelled) setReports(res.data.data);
      })
      .catch(() => {
        // Do not log the error — keep server/case details out of logs.
        if (!cancelled) setError(t('staffReports.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [typeFilter, t]);

  return (
    <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.h1}>{t('staffReports.title')}</Text>

      <Text style={theme.label}>{t('staffReports.filterByType')}</Text>
      <View style={theme.pickerWrapper}>
        <Picker
          selectedValue={typeFilter}
          onValueChange={(value) => setTypeFilter(String(value))}
          accessibilityLabel={t('staffReports.filterByType')}
        >
          <Picker.Item label={t('staffReports.allTypes')} value="" />
          {CASE_TYPES.map((type) => (
            <Picker.Item key={type} label={t(`caseTypes.${type}`)} value={type} />
          ))}
        </Picker>
      </View>

      {loading ? <Text style={theme.paragraph}>{t('common.loading')}</Text> : null}
      {error ? <Text style={theme.fieldError}>{error}</Text> : null}
      {!loading && !error && reports.length === 0 ? (
        <Text style={theme.paragraph}>{t('staffReports.empty')}</Text>
      ) : null}

      {!loading && !error
        ? reports.map((r) => (
            <View key={r.id} style={local.card}>
              <View style={local.cardHeader}>
                <Text style={local.mono}>{r.reference_code}</Text>
                <View style={local.badge}>
                  <Text style={local.badgeText}>{t(`statuses.${r.status}`)}</Text>
                </View>
              </View>
              <Text style={local.cardLine}>
                {t('staffReports.caseType')}: {t(`caseTypes.${r.case_type}`)}
              </Text>
              <Text style={local.cardLine}>
                {t('staffReports.district')}: {r.district}
              </Text>
              <Text style={local.cardLine}>
                {t('staffReports.date')}: {new Date(r.created_at).toLocaleDateString()}
              </Text>
            </View>
          ))
        : null}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    backgroundColor: colors.secondary,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  cardLine: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 2,
  },
});
