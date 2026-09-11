/**
 * JusticeNow (mobile) — Admin Staff editor (create AND edit).
 * Route: /staff/admin/staff-member/[id]. A param of 'new' means CREATE; any
 * other value is the id of a staff account to EDIT.
 *
 * On edit we source the account from fetchStaff() (the ADMIN list, which
 * includes inactive accounts and their is_active flag). There is no public
 * per-staff endpoint — staff accounts are admin-only.
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff").
 * Every call goes through the token-bearing staffApi against admin-guarded
 * endpoints; the server is the real boundary. The `!isAdmin` Redirect is UX. A
 * 401 means the in-memory token expired → log out and return to login.
 *
 * VALIDATION: client-side checks give fast feedback, but the SERVER is the
 * authority — it re-validates, bcrypt-hashes the password, and returns 400/404.
 *
 * SECURITY: the password field is write-only PLAINTEXT sent to the server, which
 * hashes it. We NEVER render, store, or log a password_hash (the server never
 * sends one), and never log the plaintext password.
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
  fetchStaff,
  fetchAllOrganisations,
  createStaff,
  updateStaff,
  deactivateStaff,
} from '../../../../src/api/client';
import type { StaffInput, AdminOrganisation } from '../../../../src/api/client';
import { STAFF_ROLES } from '../../../../src/constants';
import { useAuth } from '../../../../src/context/AuthContext';
import { colors, styles as theme } from '../../../../src/theme';

export default function AdminStaffEditor() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const isNew = id === 'new';

  // Form state. `password` is only ever the PLAINTEXT to send; never a hash.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Org options for the SelectField, loaded from the admin org list.
  const [orgs, setOrgs] = useState<AdminOrganisation[]>([]);

  // Screen state.
  const [loading, setLoading] = useState(true); // both new + edit need the org list
  const [loadFailed, setLoadFailed] = useState<'notFound' | 'network' | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Per-field validation errors, shown under each field. `formError` is reserved
  // for server/network failures (e.g. duplicate email) shown near the Save button.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) =>
    setFieldErrors((e) => (e[k] ? { ...e, [k]: '' } : e));

  const goToLogin = useCallback(() => {
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(null);
    try {
      // The org SelectField needs the full org list in both create and edit.
      const orgRes = await fetchAllOrganisations();
      setOrgs(orgRes.data.data);

      if (!isNew) {
        // Source the account from the admin staff list (covers inactive too).
        const staffRes = await fetchStaff();
        const member = staffRes.data.data.find((s) => s.id === id);
        if (!member) {
          setLoadFailed('notFound');
          return;
        }
        setName(member.name);
        setEmail(member.email);
        setRole(member.role);
        setOrganisationId(member.organisation_id);
        setIsActive(member.is_active);
        // password intentionally left blank — a blank field means "unchanged".
      }
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

  const save = useCallback(async () => {
    // Client-side validation for fast feedback; the server is the authority.
    // Errors are shown UNDER each field rather than as one message at the bottom.
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t('adminStaff.nameRequired');
    if (!email.trim()) next.email = t('adminStaff.emailRequired');
    if (!role) next.role = t('adminStaff.roleRequired');
    if (!organisationId) next.organisation = t('adminStaff.organisationRequired');
    // On CREATE the password is required; on EDIT a blank field means unchanged.
    if (isNew && !password) next.password = t('adminStaff.passwordRequired');
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;
    if (!role || !organisationId) return; // narrowed above; keeps payload type honest

    setFormError(null);
    setSaving(true);

    // snake_case body matching the server exactly.
    const payload: StaffInput = {
      name: name.trim(),
      email: email.trim(),
      role,
      organisation_id: organisationId,
    };
    // Only send a password when one was typed (create: always; edit: to change).
    if (password) {
      payload.password = password;
    }

    try {
      if (isNew) {
        await createStaff(payload);
      } else {
        // is_active is editable only on an existing account.
        await updateStaff(id as string, { ...payload, is_active: isActive });
      }
      router.back();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      // Surface the server's validation message (e.g. duplicate email) when
      // present, else a generic one. Never log the payload (it holds a password).
      const message =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : t('adminStaff.networkError');
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }, [
    name,
    email,
    role,
    organisationId,
    password,
    isActive,
    isNew,
    id,
    router,
    goToLogin,
    t,
  ]);

  const onDeactivate = useCallback(() => {
    // Confirm before deactivating — it blocks the account's login. The server
    // soft-deletes (never a hard delete) and refuses self / last-admin.
    Alert.alert(t('adminStaff.deactivate'), t('adminStaff.deactivateConfirm'), [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('adminStaff.deactivate'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deactivateStaff(id as string);
            router.back();
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 401) {
              goToLogin();
              return;
            }
            // The server returns a specific 400 message when it refuses (the
            // caller's own account, or the last active admin) — surface it.
            const message =
              axios.isAxiosError(err) && err.response?.data?.message
                ? String(err.response.data.message)
                : t('adminStaff.networkError');
            setFormError(message);
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

  const title = isNew ? t('adminStaff.new') : t('adminStaff.edit');

  const roleOptions: Option[] = STAFF_ROLES.map((r) => ({
    value: r,
    label: t(`roles.${r}`),
  }));
  const orgOptions: Option[] = orgs.map((o) => ({ value: o.id, label: o.name }));

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
          <ActivityIndicator
            color={colors.primary}
            accessibilityLabel={t('common.loading')}
          />
        </View>
      ) : loadFailed === 'notFound' ? (
        <View style={local.centre}>
          <Text style={local.emptyText}>{t('adminStaff.empty')}</Text>
        </View>
      ) : loadFailed === 'network' ? (
        <View style={local.centre}>
          <ErrorState message={t('adminStaff.networkError')} onRetry={load} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={local.form}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <Text style={theme.label}>{t('adminStaff.name')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.name ? local.inputError : null]}
            value={name}
            onChangeText={(v) => {
              setName(v);
              clearErr('name');
            }}
            placeholder={t('adminStaff.namePlaceholder')}
            placeholderTextColor={colors.muted}
            editable={!saving}
            accessibilityLabel={t('adminStaff.name')}
          />
          {fieldErrors.name ? (
            <Text style={theme.fieldError} accessibilityRole="alert">
              {fieldErrors.name}
            </Text>
          ) : null}

          {/* Email */}
          <Text style={theme.label}>{t('adminStaff.email')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.email ? local.inputError : null]}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              clearErr('email');
            }}
            placeholder={t('adminStaff.emailPlaceholder')}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            accessibilityLabel={t('adminStaff.email')}
          />
          {fieldErrors.email ? (
            <Text style={theme.fieldError} accessibilityRole="alert">
              {fieldErrors.email}
            </Text>
          ) : null}

          {/* Role */}
          <View style={local.selectWrap}>
            <SelectField
              label={t('adminStaff.role')}
              required
              placeholder={t('adminStaff.role')}
              value={role}
              options={roleOptions}
              onChange={(v) => {
                setRole(v);
                clearErr('role');
              }}
            />
            {fieldErrors.role ? (
              <Text style={theme.fieldError} accessibilityRole="alert">
                {fieldErrors.role}
              </Text>
            ) : null}
          </View>

          {/* Organisation */}
          <View style={local.selectWrap}>
            <SelectField
              label={t('adminStaff.organisation')}
              required
              placeholder={t('adminStaff.organisation')}
              value={organisationId}
              options={orgOptions}
              onChange={(v) => {
                setOrganisationId(v);
                clearErr('organisation');
              }}
            />
            {fieldErrors.organisation ? (
              <Text style={theme.fieldError} accessibilityRole="alert">
                {fieldErrors.organisation}
              </Text>
            ) : null}
          </View>

          {/* Password. Create: required. Edit: optional "set new password". */}
          <Text style={theme.label}>
            {isNew ? t('adminStaff.password') : t('adminStaff.newPassword')}
          </Text>
          <TextInput
            style={[theme.input, fieldErrors.password ? local.inputError : null]}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              clearErr('password');
            }}
            placeholder={
              isNew
                ? t('adminStaff.passwordPlaceholder')
                : t('adminStaff.newPasswordPlaceholder')
            }
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            accessibilityLabel={
              isNew ? t('adminStaff.password') : t('adminStaff.newPassword')
            }
          />
          {fieldErrors.password ? (
            <Text style={theme.fieldError} accessibilityRole="alert">
              {fieldErrors.password}
            </Text>
          ) : null}
          <Text style={local.hint}>
            {isNew ? t('adminStaff.passwordHint') : t('adminStaff.newPasswordHint')}
          </Text>

          {/* Active toggle — edit only */}
          {isNew ? null : (
            <View style={local.toggleRow}>
              <Text style={local.toggleLabel}>{t('adminStaff.active')}</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                disabled={saving}
                accessibilityLabel={t('adminStaff.active')}
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
            accessibilityLabel={t('adminStaff.save')}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={theme.btnPrimaryText}>{t('adminStaff.save')}</Text>
            )}
          </Pressable>

          {/* Deactivate — edit only */}
          {isNew ? null : (
            <Pressable
              onPress={onDeactivate}
              disabled={saving}
              style={[local.deactivateBtn, saving && theme.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('adminStaff.deactivate')}
            >
              <Text style={local.deactivateText}>{t('adminStaff.deactivate')}</Text>
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
  hint: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
  },
  inputError: { borderColor: colors.danger },
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
