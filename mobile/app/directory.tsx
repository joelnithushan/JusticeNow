/**
 * JusticeNow (mobile) — Legal resource directory (list + filter).
 *
 * A PUBLIC, UNAUTHENTICATED browse of active legal-aid organisations. Reporters
 * never log in here — the list is fetched through the TOKENLESS reporter `api`
 * (fetchOrganisations), so no staff Authorization header is ever attached.
 *
 * Two optional filters (District, Case type) narrow the list; each is clearable
 * back to "all". Tapping a card opens the org's detail at /directory/[id].
 *
 * Loading / empty / network-error states mirror status.tsx. All strings go
 * through t(); all styling comes from theme tokens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import ReporterTopBar from '../components/ReporterTopBar';
import ErrorState from '../components/ErrorState';
import SelectField, { type Option } from '../components/SelectField';
import { fetchOrganisations } from '../src/api/client';
import type { Organisation } from '../src/api/client';
import { CASE_TYPES, DISTRICTS } from '../src/constants';
import { colors, styles as theme } from '../src/theme';

export default function Directory() {
  const { t } = useTranslation();
  const router = useRouter();

  // Both filters are optional; null means "no filter" (show all).
  const [district, setDistrict] = useState<string | null>(null);
  const [caseType, setCaseType] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  // Only a transport failure (no response) is a retryable error here; the org
  // directory is public so there is no no-oracle concern like the status screen.
  const [error, setError] = useState(false);

  // District options: the shared DISTRICTS list plus a clear-to-all entry. The
  // empty-string value acts as "clear" (SelectField.onChange gives a string).
  const districtOptions: Option[] = [
    { value: '', label: t('directory.allDistricts') },
    ...DISTRICTS.map((d) => ({ value: d, label: d })),
  ];
  const caseTypeOptions: Option[] = [
    { value: '', label: t('directory.allCaseTypes') },
    ...CASE_TYPES.map((c) => ({ value: c, label: t(`caseTypes.${c}`) })),
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetchOrganisations({
        district: district ?? undefined,
        caseType: caseType ?? undefined,
      });
      setOrgs(res.data.data);
    } catch {
      // Any failure surfaces the same generic, retryable error — we never leak
      // server text into the UI (see CLAUDE.md — no case/server details in errors).
      setError(true);
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, [district, caseType]);

  // Re-fetch whenever a filter changes (or on first mount).
  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={local.screen}>
      <ReporterTopBar title={t('directory.title')} />

      <ScrollView contentContainerStyle={theme.page} keyboardShouldPersistTaps="handled">
        <SelectField
          label={t('directory.filterDistrict')}
          placeholder={t('directory.allDistricts')}
          value={district}
          options={districtOptions}
          // An empty value clears the filter back to "all".
          onChange={(v) => setDistrict(v ? v : null)}
        />
        <SelectField
          label={t('directory.filterCaseType')}
          placeholder={t('directory.allCaseTypes')}
          value={caseType}
          options={caseTypeOptions}
          onChange={(v) => setCaseType(v ? v : null)}
        />

        {loading ? (
          <ActivityIndicator style={local.loader} color={colors.primary} />
        ) : error ? (
          <ErrorState message={t('directory.networkError')} onRetry={load} />
        ) : orgs.length === 0 ? (
          <Text style={local.empty}>{t('directory.empty')}</Text>
        ) : (
          <View>
            {orgs.map((org) => (
              <OrgCard
                key={org.id}
                org={org}
                onPress={() => router.push(`/directory/${org.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Presentational card: name, district, case-type chips, one-line description. */
function OrgCard({ org, onPress }: { org: Organisation; onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <Pressable
      style={local.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${org.name}. ${org.district}`}
    >
      <Text style={local.cardName}>{org.name}</Text>
      <Text style={local.cardDistrict}>{org.district}</Text>

      {org.case_types.length > 0 ? (
        <View style={local.chipRow}>
          {org.case_types.map((c) => (
            <View key={c} style={local.chip}>
              <Text style={local.chipText}>{t(`caseTypes.${c}`)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {org.description ? (
        <Text style={local.cardDesc} numberOfLines={1}>
          {org.description}
        </Text>
      ) : null}
    </Pressable>
  );
}

const local = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    marginTop: 32,
  },
  empty: {
    marginTop: 24,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
  },
  card: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: 12,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  cardDistrict: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  chip: {
    backgroundColor: colors.primaryTint,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  cardDesc: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginTop: 8,
  },
});
