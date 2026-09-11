/**
 * JusticeNow (mobile) — Legal resource directory: organisation detail.
 *
 * A PUBLIC, UNAUTHENTICATED view of one active legal-aid organisation. Fetched
 * through the TOKENLESS reporter `api` (fetchOrganisation) — reporters never log
 * in, so no staff Authorization header is ever attached.
 *
 * Shows the org's name, district, full description, the case types it handles
 * (localised chips), and contact actions: phone via tel: and email via mailto:.
 * A not-found/inactive org shows the generic notFound message; a transport
 * failure shows the retryable ErrorState. All strings go through t().
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import axios from 'axios';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import ReporterTopBar from '../../components/ReporterTopBar';
import ErrorState from '../../components/ErrorState';
import { fetchOrganisation } from '../../src/api/client';
import type { Organisation } from '../../src/api/client';
import { colors, styles as theme } from '../../src/theme';

// A response (any status) means the server answered: a missing/inactive org is a
// definitive "not found", not a retryable error. Only the total absence of a
// response (transport failure) offers a retry — same split as status.tsx.
type LoadError = 'notFound' | 'network';

export default function OrganisationDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [org, setOrg] = useState<Organisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError('notFound');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOrganisation(id);
      setOrg(res.data.data);
    } catch (err) {
      // Only a transport failure is retryable; a 404 (missing/inactive org) is
      // a definitive answer. We never leak server text into the UI.
      if (axios.isAxiosError(err) && !err.response) {
        setError('network');
      } else {
        setError('notFound');
      }
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Open the device dialer / mail client. Guarded so a device without a handler
  // simply does nothing rather than crashing.
  const openTel = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };
  const openMail = (mail: string) => {
    Linking.openURL(`mailto:${mail}`).catch(() => {});
  };

  return (
    <View style={local.screen}>
      <ReporterTopBar title={org?.name ?? t('directory.title')} />

      <ScrollView contentContainerStyle={theme.page}>
        {loading ? (
          <ActivityIndicator style={local.loader} color={colors.primary} />
        ) : error === 'network' ? (
          <ErrorState message={t('directory.networkError')} onRetry={load} />
        ) : error === 'notFound' || !org ? (
          <View style={local.notFoundBox} accessibilityRole="alert">
            <Text style={local.notFoundText}>{t('directory.notFound')}</Text>
          </View>
        ) : (
          <View>
            <Text style={theme.h1}>{org.name}</Text>
            <Text style={local.district}>{org.district}</Text>

            {org.description ? (
              <Text style={local.description}>{org.description}</Text>
            ) : null}

            {org.case_types.length > 0 ? (
              <View style={local.section}>
                <Text style={local.sectionTitle}>{t('directory.handles')}</Text>
                <View style={local.chipRow}>
                  {org.case_types.map((c) => (
                    <View key={c} style={local.chip}>
                      <Text style={local.chipText}>{t(`caseTypes.${c}`)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {org.contact_phone || org.contact_email ? (
              <View style={local.section}>
                <Text style={local.sectionTitle}>{t('directory.contact')}</Text>
                {org.contact_phone ? (
                  <Pressable
                    style={theme.btnPrimary}
                    onPress={() => openTel(org.contact_phone as string)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('directory.call')}. ${org.contact_phone}`}
                  >
                    <Text style={theme.btnPrimaryText}>
                      {t('directory.call')} · {org.contact_phone}
                    </Text>
                  </Pressable>
                ) : null}
                {org.contact_email ? (
                  <Pressable
                    style={theme.btnSecondary}
                    onPress={() => openMail(org.contact_email as string)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('directory.email')}. ${org.contact_email}`}
                  >
                    <Text style={theme.btnSecondaryText}>
                      {t('directory.email')} · {org.contact_email}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
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
  district: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  notFoundBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  notFoundText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
});
