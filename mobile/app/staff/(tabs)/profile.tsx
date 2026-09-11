/**
 * JusticeNow (mobile) — Staff profile tab (self-service). Route: /staff/profile.
 *
 * The authenticated staffer's own profile: view + edit their details, change
 * their avatar, and (for password accounts) change their password. Reached
 * inside the staff tab navigator whose _layout guards for an authenticated
 * session — reporters never authenticate, so they never see this screen.
 *
 * COMPLETION GATE: when profile_completed is false the other tabs are hidden by
 * the tab layout and this screen shows a prompt; a successful save that fills the
 * required fields flips the flag server-side, and the tabs unlock on refresh.
 *
 * SERVER IS THE AUTHORITY: the NIC is validated server-side (we show the server's
 * 400 message inline), and gender + date_of_birth are DERIVED from the NIC by the
 * server — we only ever display them read-only, never edit or send them.
 *
 * PRIVACY: the profile carries staff PII (name, NIC, phone). We never log the
 * profile, the form fields, or any error object. All strings go through t();
 * all styling comes from theme tokens.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import axios from 'axios';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';

import EyeIcon from '../../../components/EyeIcon';
import ErrorState from '../../../components/ErrorState';
import StaffHeader from '../../../components/StaffHeader';
import LanguageSwitcher from '../../../components/LanguageSwitcher';
import {
  updateMe,
  uploadAvatar,
  changeMyPassword,
} from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { useProfile } from '../../../src/context/ProfileContext';
import { colors, styles as theme } from '../../../src/theme';

// Client-side SHAPE checks for fast feedback. The server re-validates and is the
// authority (it also derives gender + DOB from the NIC). Old NIC = 9 digits + V/X;
// new NIC = 12 digits. Mobile mirrors the server's isValidLkMobile.
const NIC_RE = /^(\d{9}[VvXx]|\d{12})$/;
const LK_MOBILE_RE = /^(?:\+94|0094|94|0)?7[0-8]\d{7}$/;

export default function StaffProfileTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { profile, loading, error, refresh, setProfile } = useProfile();

  // Editable field state. Seeded from the loaded profile and re-seeded whenever
  // the profile identity changes (a fresh fetch / different account).
  const [name, setName] = useState('');
  const [nic, setNic] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [barNumber, setBarNumber] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Per-field, client-side validation errors, shown under each field.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) =>
    setFieldErrors((e) => (e[k] ? { ...e, [k]: '' } : e));

  const [avatarBusy, setAvatarBusy] = useState(false);

  // Change-password sub-form (password accounts only).
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const profileId = profile?.id;
  // Re-seed the form when the underlying profile identity changes (initial load
  // or a switch of account). We key off id so an in-place refresh that returns
  // the same account does not clobber unsaved edits.
  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setNic(profile.nic ?? '');
      setPhone(profile.phone ?? '');
      setDesignation(profile.designation ?? '');
      setBarNumber(profile.bar_number ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const isAttorney = profile?.role === 'attorney';
  const isPasswordAccount = profile?.auth_method === 'password';

  const goToLogin = useCallback(() => {
    // In-memory token expired/invalid — drop it so nothing lingers, then require
    // a fresh sign-in (tokens are never persisted; see AuthContext).
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  // Map an axios error to a message: prefer the server's 400 `message`, treat a
  // 401 as an expired session (bounce to login), else a generic fallback.
  const messageFor = useCallback(
    (err: unknown, fallback: string): string | null => {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          goToLogin();
          return null;
        }
        const serverMessage = err.response?.data?.message;
        if (typeof serverMessage === 'string' && serverMessage.length > 0) {
          return serverMessage;
        }
      }
      return fallback;
    },
    [goToLogin],
  );

  const onSave = useCallback(async () => {
    if (saving || !profile) return;

    // Validate the SHAPE of each field first, showing any problem under that
    // field. The server still re-validates (and derives gender/DOB from the NIC).
    const nicTrim = nic.trim();
    const phoneTrim = phone.trim();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t('profile.nameRequired');
    if (!nicTrim) next.nic = t('profile.nicRequired');
    else if (!NIC_RE.test(nicTrim)) next.nic = t('profile.nicInvalid');
    if (!phoneTrim) next.phone = t('profile.phoneRequired');
    else if (!LK_MOBILE_RE.test(phoneTrim.replace(/[\s-]/g, ''))) {
      next.phone = t('profile.phoneInvalid');
    }
    if (!designation.trim()) next.designation = t('profile.designationRequired');
    if (isAttorney && !barNumber.trim()) next.barNumber = t('profile.barNumberRequired');
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      // Send only the editable fields. bar_number is included only for attorneys
      // (the server ignores it for other roles anyway).
      const res = await updateMe({
        name: name.trim(),
        nic: nic.trim(),
        phone: phone.trim(),
        designation: designation.trim(),
        ...(isAttorney ? { bar_number: barNumber.trim() } : {}),
      });
      // Push the fresh profile into context so the derived gender/DOB, the
      // completion flag and the nav avatar all update immediately.
      setProfile(res.data.data);
      setSaved(true);
    } catch (err) {
      // NEVER log err — it can echo the submitted NIC/phone. Show the server's
      // inline validation message when present.
      const message = messageFor(err, t('profile.saveFailed'));
      if (message) setSaveError(message);
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    profile,
    name,
    nic,
    phone,
    designation,
    barNumber,
    isAttorney,
    setProfile,
    messageFor,
    t,
  ]);

  const onChangePhoto = useCallback(async () => {
    if (avatarBusy) return;
    setSaveError(null);
    // Ask for media-library permission before opening the picker.
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setSaveError(t('profile.photoPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setAvatarBusy(true);
    try {
      await uploadAvatar({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
      // Re-fetch so the new avatar_url flows through context (screen + nav icon).
      await refresh();
    } catch (err) {
      const message = messageFor(err, t('profile.photoFailed'));
      if (message) setSaveError(message);
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarBusy, refresh, messageFor, t]);

  const onChangePassword = useCallback(async () => {
    if (pwBusy) return;
    setPwBusy(true);
    setPwDone(false);
    setPwError(null);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      setPwDone(true);
      // Clear both fields the moment they have served their purpose.
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      // NEVER log err — it can echo submitted passwords.
      const message = messageFor(err, t('profile.passwordFailed'));
      if (message) setPwError(message);
    } finally {
      setPwBusy(false);
    }
  }, [pwBusy, currentPassword, newPassword, messageFor, t]);

  const initials = useMemo(() => deriveInitials(profile?.name), [profile?.name]);

  // Loading (first fetch, no profile yet).
  if (loading && !profile) {
    return (
      <View style={[local.screen, local.centre, { paddingTop: insets.top }]}>
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  // Fetch failed and we have nothing to show.
  if (error && !profile) {
    return (
      <View style={[local.screen, local.centre, { paddingTop: insets.top }]}>
        <ErrorState message={t('profile.loadFailed')} onRetry={refresh} />
      </View>
    );
  }

  if (!profile) {
    return null;
  }

  const canSave =
    !saving &&
    name.trim().length > 0 &&
    nic.trim().length > 0 &&
    phone.trim().length > 0 &&
    designation.trim().length > 0 &&
    (!isAttorney || barNumber.trim().length > 0);

  const canChangePassword =
    !pwBusy && currentPassword.length > 0 && newPassword.length > 0;

  return (
    <View style={local.screen}>
      <StaffHeader
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
        onSignOut={goToLogin}
        signOutLabel={t('staffReports.signOut')}
      />
      <ScrollView
        contentContainerStyle={local.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

      {/* Completion prompt — shown until the profile is complete. */}
      {!profile.profile_completed ? (
        <View style={theme.privacyNote} accessibilityRole="alert">
          <Text style={local.promptText}>{t('profile.completePrompt')}</Text>
        </View>
      ) : null}

      {/* Avatar + change-photo. */}
      <View style={local.avatarSection}>
        {profile.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={local.avatar}
            accessibilityIgnoresInvertColors
            accessibilityLabel={profile.name}
          />
        ) : (
          <View style={[local.avatar, local.avatarPlaceholder]}>
            <Text style={local.avatarInitials}>{initials}</Text>
          </View>
        )}
        <Pressable
          onPress={onChangePhoto}
          disabled={avatarBusy}
          style={[local.changePhoto, avatarBusy && theme.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhoto')}
          accessibilityState={{ disabled: avatarBusy, busy: avatarBusy }}
        >
          {avatarBusy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={local.changePhotoText}>{t('profile.changePhoto')}</Text>
          )}
        </Pressable>
      </View>

      {/* Editable fields. */}
      <Field
        label={t('profile.name')}
        required
        value={name}
        onChangeText={(v) => {
          setName(v);
          clearErr('name');
        }}
        editable={!saving}
        placeholder={t('profile.namePlaceholder')}
        error={fieldErrors.name}
      />

      <Field
        label={t('profile.nic')}
        required
        value={nic}
        onChangeText={(v) => {
          setNic(v);
          clearErr('nic');
        }}
        editable={!saving}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={t('profile.nicPlaceholder')}
        error={fieldErrors.nic}
      />
      {/* Derived (read-only) gender + DOB — only meaningful once a valid NIC has
          been saved. Shown from the server-derived values on the profile. */}
      {profile.gender || profile.date_of_birth ? (
        <View style={local.derivedRow}>
          <ReadOnly
            label={t('profile.gender')}
            value={
              profile.gender
                ? t(`profile.${profile.gender}`, { defaultValue: profile.gender })
                : t('caseDetail.notProvided')
            }
          />
          <ReadOnly
            label={t('profile.dateOfBirth')}
            value={profile.date_of_birth ?? t('caseDetail.notProvided')}
          />
        </View>
      ) : null}

      <Field
        label={t('profile.phone')}
        required
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          clearErr('phone');
        }}
        editable={!saving}
        keyboardType="phone-pad"
        placeholder={t('profile.phonePlaceholder')}
        error={fieldErrors.phone}
      />

      <Field
        label={t('profile.designation')}
        required
        value={designation}
        onChangeText={(v) => {
          setDesignation(v);
          clearErr('designation');
        }}
        editable={!saving}
        placeholder={t('profile.designationPlaceholder')}
        error={fieldErrors.designation}
      />

      {isAttorney ? (
        <Field
          label={t('profile.barNumber')}
          required
          value={barNumber}
          onChangeText={(v) => {
            setBarNumber(v);
            clearErr('barNumber');
          }}
          editable={!saving}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={t('profile.barNumberPlaceholder')}
          error={fieldErrors.barNumber}
        />
      ) : null}

      {/* Read-only account info. */}
      <ReadOnly label={t('profile.email')} value={profile.email} />
      <ReadOnly
        label={t('profile.role')}
        value={t(`roles.${profile.role}`, { defaultValue: profile.role })}
      />
      <ReadOnly
        label={t('profile.organisation')}
        value={profile.organisation_name ?? t('caseDetail.notProvided')}
      />

      {saveError ? (
        <View style={local.errorBox} accessibilityRole="alert">
          <Text style={local.errorText}>{saveError}</Text>
        </View>
      ) : null}
      {saved ? (
        <View style={local.successBox} accessibilityRole="alert">
          <Text style={local.successText}>{t('profile.saved')}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onSave}
        disabled={!canSave}
        style={[theme.btnPrimary, !canSave && theme.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={saving ? t('profile.saving') : t('profile.save')}
        accessibilityState={{ disabled: !canSave, busy: saving }}
      >
        {saving ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={theme.btnPrimaryText}>{t('profile.save')}</Text>
        )}
      </Pressable>

      {/* Preferences — a staffer can change the app language at any time here.
          The switcher persists the choice (saveLanguage) so it survives relaunch. */}
      <View style={local.passwordSection}>
        <Text style={local.sectionTitle}>{t('profile.preferences')}</Text>
        <View style={local.prefRow}>
          <View style={local.prefLabelCol}>
            <Text style={theme.label}>{t('profile.language')}</Text>
            <Text style={theme.privacyNoteSmall}>{t('profile.languageHint')}</Text>
          </View>
          <LanguageSwitcher />
        </View>
      </View>

      {/* Change-password section — password accounts only. Google accounts get a
          short note instead (the server also refuses a password change there). */}
      <View style={local.passwordSection}>
        <Text style={local.sectionTitle}>{t('profile.changePassword')}</Text>
        {isPasswordAccount ? (
          <>
            <Text style={theme.label} nativeID="currentPasswordLabel">
              {t('profile.currentPassword')}
            </Text>
            <View style={local.passwordRow}>
              <TextInput
                style={[theme.input, local.passwordInput]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showCurrent}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="password"
                editable={!pwBusy}
                accessibilityLabel={t('profile.currentPassword')}
                accessibilityLabelledBy="currentPasswordLabel"
              />
              <Pressable
                onPress={() => setShowCurrent((v) => !v)}
                style={local.eyeBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  showCurrent
                    ? t('staffLogin.hidePassword')
                    : t('staffLogin.showPassword')
                }
              >
                <EyeIcon crossed={showCurrent} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={theme.label} nativeID="newPasswordLabel">
              {t('profile.newPassword')}
            </Text>
            <View style={local.passwordRow}>
              <TextInput
                style={[theme.input, local.passwordInput]}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="newPassword"
                editable={!pwBusy}
                accessibilityLabel={t('profile.newPassword')}
                accessibilityLabelledBy="newPasswordLabel"
              />
              <Pressable
                onPress={() => setShowNew((v) => !v)}
                style={local.eyeBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  showNew
                    ? t('staffLogin.hidePassword')
                    : t('staffLogin.showPassword')
                }
              >
                <EyeIcon crossed={showNew} color={colors.muted} />
              </Pressable>
            </View>

            {pwError ? (
              <View style={local.errorBox} accessibilityRole="alert">
                <Text style={local.errorText}>{pwError}</Text>
              </View>
            ) : null}
            {pwDone ? (
              <View style={local.successBox} accessibilityRole="alert">
                <Text style={local.successText}>
                  {t('profile.passwordChanged')}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={onChangePassword}
              disabled={!canChangePassword}
              style={[theme.btnSecondary, !canChangePassword && theme.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.changePassword')}
              accessibilityState={{ disabled: !canChangePassword, busy: pwBusy }}
            >
              {pwBusy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={theme.btnSecondaryText}>
                  {t('profile.changePassword')}
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <Text style={theme.privacyNoteSmall}>
            {t('profile.googlePasswordNote')}
          </Text>
        )}
      </View>
      </ScrollView>
    </View>
  );
}

/** A labelled, editable text field matching the shared theme input style. */
function Field({
  label,
  required,
  value,
  onChangeText,
  editable,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  placeholder,
  error,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (v: string) => void;
  editable: boolean;
  keyboardType?: 'default' | 'phone-pad';
  autoCapitalize?: 'none' | 'characters';
  autoCorrect?: boolean;
  placeholder?: string;
  /** Inline validation error, rendered directly under this field. */
  error?: string;
}) {
  return (
    <View style={local.field}>
      <Text style={theme.label}>
        {label}
        {required ? <Text style={local.required}> *</Text> : null}
      </Text>
      <TextInput
        style={[theme.input, error ? local.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={autoCorrect ?? true}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
      />
      {error ? (
        <Text style={theme.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A labelled read-only value row. */
function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <View style={local.field}>
      <Text style={theme.label}>{label}</Text>
      <View style={local.readOnly}>
        <Text style={local.readOnlyText}>{value}</Text>
      </View>
    </View>
  );
}

/** Up to two initials from a display name, for the avatar placeholder. */
function deriveInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase() || '?';
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 40 },
  centre: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signOut: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  signOutText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  promptText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  avatarSection: { alignItems: 'center', marginVertical: 12 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryTint,
  },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 34, fontWeight: '800', color: colors.primary },
  changePhoto: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
    minWidth: 140,
    alignItems: 'center',
  },
  changePhotoText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  field: { marginTop: 4, marginBottom: 8 },
  required: { color: colors.danger, fontWeight: '700' },
  inputError: { borderColor: colors.danger },
  derivedRow: { flexDirection: 'row', gap: 12 },
  readOnly: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.primaryTint,
  },
  readOnlyText: { fontSize: 15, color: colors.text },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  prefLabelCol: { flex: 1 },
  passwordSection: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: 'absolute',
    right: 8,
    height: 44,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.danger },
  successBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  successText: { fontSize: 14, lineHeight: 20, color: colors.primary, fontWeight: '600' },
});
