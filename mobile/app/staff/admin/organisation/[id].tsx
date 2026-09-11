/**
 * JusticeNow (mobile) — Admin Organisation editor (create AND edit).
 * Route: /staff/admin/organisation/[id]. A param of 'new' means CREATE; any
 * other value is the id of an org to EDIT.
 *
 * On edit we source the org from fetchAllOrganisations() (the ADMIN list) rather
 * than fetchOrganisation() — the public detail endpoint returns ACTIVE orgs only,
 * so an inactive org would 404 there. The admin list includes inactive orgs and
 * their is_active flag, which the edit form needs.
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff"). Every
 * call goes through the token-bearing staffApi against admin-guarded endpoints;
 * the server is the real boundary. The `!isAdmin` Redirect is UX. A 401 means the
 * in-memory token expired → log out and return to login.
 *
 * VALIDATION: client-side checks (name + district required) give fast feedback,
 * but the SERVER is the authority — it re-validates and returns 400/404.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import axios from 'axios';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SelectField, { type Option } from '../../../../components/SelectField';
import ErrorState from '../../../../components/ErrorState';
import BackButton from '../../../../components/BackButton';
import {
  fetchAllOrganisations,
  createOrganisation,
  updateOrganisation,
  deactivateOrganisation,
} from '../../../../src/api/client';
import type { OrganisationInput } from '../../../../src/api/client';
import { CASE_TYPES, DISTRICTS } from '../../../../src/constants';
import { useAuth } from '../../../../src/context/AuthContext';
import { colors, styles as theme } from '../../../../src/theme';

export default function AdminOrganisationEditor() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const isNew = id === 'new';

  // Form state.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [district, setDistrict] = useState<string | null>(null);
  const [caseTypes, setCaseTypes] = useState<string[]>([]);
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Screen state.
  const [loading, setLoading] = useState(!isNew); // create form needs no fetch
  const [loadFailed, setLoadFailed] = useState<'notFound' | 'network' | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Per-field validation errors, shown under each field. `formError` is reserved
  // for server/network failures shown near the Save button.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) =>
    setFieldErrors((e) => (e[k] ? { ...e, [k]: '' } : e));

  const goToLogin = useCallback(() => {
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  // Load the org to edit from the ADMIN list (works for inactive orgs too).
  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setLoadFailed(null);
    try {
      const res = await fetchAllOrganisations();
      const org = res.data.data.find((o) => o.id === id);
      if (!org) {
        setLoadFailed('notFound');
        return;
      }
      setName(org.name);
      setDescription(org.description ?? '');
      setDistrict(org.district);
      setCaseTypes(org.case_types);
      setContactPhone(org.contact_phone ?? '');
      setContactEmail(org.contact_email ?? '');
      setIsActive(org.is_active);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      setLoadFailed('network');
    } finally {
      setLoading(false);
    }
  }, [id, isNew, goToLogin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleCaseType = useCallback((value: string) => {
    setCaseTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  const save = useCallback(async () => {
    // Client-side validation for fast feedback; the server is the authority.
    // Errors are shown UNDER each field rather than as one message at the bottom.
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t('adminOrg.nameRequired');
    if (!district) next.district = t('adminOrg.districtRequired');
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;
    if (!district) return; // narrowed above; keeps the payload type honest

    setFormError(null);
    setSaving(true);

    // snake_case body matching the server exactly. Optional text fields send
    // null when blank so the server can clear them.
    const payload: OrganisationInput = {
      name: name.trim(),
      description: description.trim() || null,
      district,
      case_types: caseTypes,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
    };

    try {
      if (isNew) {
        await createOrganisation(payload);
      } else {
        // is_active is editable only on an existing org.
        await updateOrganisation(id as string, { ...payload, is_active: isActive });
      }
      router.back();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      // Surface the server's validation message when present, else a generic one.
      const message =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : t('adminOrg.networkError');
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }, [
    name,
    description,
    district,
    caseTypes,
    contactPhone,
    contactEmail,
    isActive,
    isNew,
    id,
    router,
    goToLogin,
    t,
  ]);

  const onDeactivate = useCallback(() => {
    // Confirm before deactivating — it hides the org from the public directory
    // and case assignment. The server soft-deletes (never a hard delete).
    Alert.alert(t('adminOrg.deactivate'), t('adminOrg.deactivateConfirm'), [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('adminOrg.deactivate'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deactivateOrganisation(id as string);
            router.back();
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 401) {
              goToLogin();
              return;
            }
            setFormError(t('adminOrg.networkError'));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [id, router, goToLogin, t]);

  if (!isAdmin) {
    return <Redirect href="/staff/reports" />;
  }

  const title = isNew ? t('adminOrg.new') : t('adminOrg.edit');

  const districtOptions: Option[] = DISTRICTS.map((d) => ({ value: d, label: d }));

  return (
    <View style={[local.screen, { paddingTop: insets.top }]}>
      <View style={local.header}>
        <BackButton onPress={() => router.back()} label={t('common.back')} />
        <Text style={local.title} accessibilityRole="header">
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={local.centre}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : loadFailed === 'notFound' ? (
        <View style={local.centre}>
          <Text style={local.emptyText}>{t('adminOrg.empty')}</Text>
        </View>
      ) : loadFailed === 'network' ? (
        <View style={local.centre}>
          <ErrorState message={t('adminOrg.networkError')} onRetry={load} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={local.form}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <Text style={theme.label}>{t('adminOrg.name')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.name ? local.inputError : null]}
            value={name}
            onChangeText={(v) => {
              setName(v);
              clearErr('name');
            }}
            placeholder={t('adminOrg.namePlaceholder')}
            placeholderTextColor={colors.muted}
            editable={!saving}
            accessibilityLabel={t('adminOrg.name')}
          />
          {fieldErrors.name ? (
            <Text style={theme.fieldError} accessibilityRole="alert">
              {fieldErrors.name}
            </Text>
          ) : null}

          {/* Description (multiline) */}
          <Text style={theme.label}>{t('adminOrg.description')}</Text>
          <TextInput
            style={[theme.input, theme.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('adminOrg.descriptionPlaceholder')}
            placeholderTextColor={colors.muted}
            multiline
            editable={!saving}
            accessibilityLabel={t('adminOrg.description')}
          />

          {/* District */}
          <View style={local.selectWrap}>
            <SelectField
              label={t('adminOrg.district')}
              required
              placeholder={t('adminOrg.district')}
              value={district}
              options={districtOptions}
              onChange={(v) => {
                setDistrict(v);
                clearErr('district');
              }}
            />
            {fieldErrors.district ? (
              <Text style={theme.fieldError} accessibilityRole="alert">
                {fieldErrors.district}
              </Text>
            ) : null}
          </View>

          {/* Case types — toggleable chips over CASE_TYPES */}
          <Text style={theme.label}>{t('adminOrg.caseTypes')}</Text>
          <View style={local.chipRow}>
            {CASE_TYPES.map((c) => {
              const active = caseTypes.includes(c);
              return (
                <Pressable
                  key={c}
                  onPress={() => toggleCaseType(c)}
                  disabled={saving}
                  style={[local.chip, active && local.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(`caseTypes.${c}`)}
                >
                  <Text style={[local.chipText, active && local.chipTextActive]}>
                    {t(`caseTypes.${c}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Contact phone */}
          <Text style={theme.label}>{t('adminOrg.contactPhone')}</Text>
          <TextInput
            style={theme.input}
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder={t('adminOrg.contactPhonePlaceholder')}
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            editable={!saving}
            accessibilityLabel={t('adminOrg.contactPhone')}
          />

          {/* Contact email */}
          <Text style={theme.label}>{t('adminOrg.contactEmail')}</Text>
          <TextInput
            style={theme.input}
            value={contactEmail}
            onChangeText={setContactEmail}
            placeholder={t('adminOrg.contactEmailPlaceholder')}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!saving}
            accessibilityLabel={t('adminOrg.contactEmail')}
          />

          {/* Active toggle — edit only */}
          {isNew ? null : (
            <View style={local.toggleRow}>
              <Text style={local.toggleLabel}>{t('adminOrg.active')}</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                disabled={saving}
                accessibilityLabel={t('adminOrg.active')}
              />
            </View>
          )}

          {formError ? (
            <Text style={local.errorText} accessibilityRole="alert">
              {formError}
            </Text>
          ) : null}

          {/* Save */}
          <Pressable
            onPress={save}
            disabled={saving}
            style={[theme.btnPrimary, saving && theme.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('adminOrg.save')}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={theme.btnPrimaryText}>
                {saving ? t('adminOrg.saving') : t('adminOrg.save')}
              </Text>
            )}
          </Pressable>

          {/* Deactivate — edit only */}
          {isNew ? null : (
            <Pressable
              onPress={onDeactivate}
              disabled={saving}
              style={[local.deactivateBtn, saving && theme.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('adminOrg.deactivate')}
            >
              <Text style={local.deactivateText}>{t('adminOrg.deactivate')}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
  },
  centre: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 48,
  },
  emptyText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  form: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  selectWrap: {
    marginTop: 12,
  },
  inputError: { borderColor: colors.danger },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    marginBottom: 4,
  },
  chip: {
    backgroundColor: colors.primaryTint,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  chipTextActive: {
    color: colors.primaryText,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    marginTop: 12,
  },
  deactivateBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deactivateText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.danger,
  },
});
