/**
 * JusticeNow (mobile) — Staff self-service signup.
 *
 * WHY THIS EXISTS: staff (org_admin / attorney / officer) may REQUEST an account
 * instead of waiting for an admin to provision one. The platform 'admin' role is
 * NEVER self-registerable (enforced server-side and by the options here).
 *
 * SECURITY / PENDING APPROVAL: staff accounts grant access to confidential case
 * data, so a signup creates a PENDING (inactive) account. It cannot log in until
 * a platform/org admin activates it — the login endpoints reject inactive rows.
 * On success we show a "pending approval" screen, never a session/token.
 *
 * Email + password OR Google (Supabase Auth). For Google, the role + org are
 * chosen here and the email comes from the Google-verified identity server-side.
 * All strings go through t(); styling comes from theme tokens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Svg, { Path } from 'react-native-svg';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

import GradientBackground from '../../components/GradientBackground';
import BrandLogo from '../../components/BrandLogo';
import EyeIcon from '../../components/EyeIcon';
import SelectField, { type Option } from '../../components/SelectField';
import { registerStaff, registerStaffGoogle, fetchOrganisations } from '../../src/api/client';
import type { Organisation } from '../../src/api/client';
import { supabase } from '../../src/api/supabase';
import { colors, styles as theme } from '../../src/theme';

WebBrowser.maybeCompleteAuthSession();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const ROLES = ['org_admin', 'attorney', 'officer'];

function paramFromUrl(url: string, key: string): string | null {
  const hash = url.includes('#') ? url.split('#')[1] : '';
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  return new URLSearchParams(hash).get(key) || new URLSearchParams(query).get(key);
}

type Errors = Record<string, string>;

export default function StaffRegister() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));

  // Load the public organisation list for the picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchOrganisations();
        if (!cancelled) setOrgs(res.data.data);
      } catch {
        if (!cancelled) setErrors((e) => ({ ...e, organisation: t('staffRegister.errors.orgLoadFailed') }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const roleOptions: Option[] = ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }));
  const orgOptions: Option[] = orgs.map((o) => ({ value: o.id, label: o.name }));

  // Validate the fields the credentialled (email+password) signup needs. Google
  // signup skips the password fields (the OAuth token is the credential).
  const validate = useCallback(
    (withPassword: boolean): boolean => {
      const next: Errors = {};
      if (!name.trim()) next.name = t('staffRegister.errors.nameRequired');
      if (withPassword) {
        const e = email.trim();
        if (!e) next.email = t('staffRegister.errors.emailRequired');
        else if (!EMAIL_RE.test(e)) next.email = t('staffRegister.errors.emailInvalid');
        if (!password) next.password = t('staffRegister.errors.passwordRequired');
        else if (password.length < MIN_PASSWORD) next.password = t('staffRegister.errors.passwordTooShort');
        if (confirm !== password) next.confirm = t('staffRegister.errors.confirmMismatch');
      }
      if (!role) next.role = t('staffRegister.errors.roleRequired');
      if (!organisationId) next.organisation = t('staffRegister.errors.organisationRequired');
      setErrors(next);
      return Object.keys(next).length === 0;
    },
    [name, email, password, confirm, role, organisationId, t],
  );

  const onSubmit = async () => {
    if (submitting) return;
    if (!validate(true) || !role || !organisationId) return;
    setSubmitting(true);
    try {
      await registerStaff({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        organisationId,
      });
      setPassword('');
      setConfirm('');
      setSubmitted(true);
    } catch (err) {
      // Never log err — it can echo the submitted email/password. Show the
      // server's field message (e.g. duplicate email) when present.
      let message = t('staffRegister.errors.failed');
      if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
        message = err.response.data.message;
      }
      setErrors((e) => ({ ...e, form: message }));
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    if (googleBusy || submitting) return;
    // Role + org must be chosen before Google (the email comes from Google, but
    // the role/org come from this form).
    if (!validate(false) || !role || !organisationId) return;
    setGoogleBusy(true);
    try {
      const redirectTo = Linking.createURL('/staff/register');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data?.url) throw error ?? new Error('No auth URL');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) return; // cancelled
      const accessToken = paramFromUrl(result.url, 'access_token');
      if (!accessToken) throw new Error('No access token');
      await registerStaffGoogle({ accessToken, name: name.trim(), role, organisationId });
      setSubmitted(true);
    } catch (err) {
      let message = t('staffRegister.errors.googleFailed');
      if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
        message = err.response.data.message;
      }
      setErrors((e) => ({ ...e, form: message }));
    } finally {
      setGoogleBusy(false);
    }
  };

  // Success: a "pending approval" confirmation — never a session.
  if (submitted) {
    return (
      <View style={local.screen}>
        <StatusBar style="light" />
        <GradientBackground id="register-done" style={[local.header, { paddingTop: insets.top + 20 }]}>
          <View style={local.logoWrap}>
            <BrandLogo size={64} variant="chip" accessibilityLabel={t('app.title')} />
          </View>
        </GradientBackground>
        <View style={local.doneBody}>
          <View style={local.checkCircle}>
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
              <Path d="M5 13 l4 4 l10 -11" stroke={colors.primaryText} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <Text style={local.doneTitle} accessibilityRole="header">{t('staffRegister.pendingTitle')}</Text>
          <Text style={local.doneBodyText}>{t('staffRegister.pendingBody')}</Text>
          <Pressable
            onPress={() => router.replace('/staff/login')}
            style={[theme.btnPrimary, local.doneBtn]}
            accessibilityRole="button"
          >
            <Text style={theme.btnPrimaryText}>{t('staffRegister.backToLogin')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const busy = submitting || googleBusy;

  return (
    <View style={local.screen}>
      <StatusBar style="light" />
      <GradientBackground id="register-header" style={[local.header, { paddingTop: insets.top + 20 }]}>
        <View style={local.logoWrap}>
          <BrandLogo size={64} variant="chip" accessibilityLabel={t('app.title')} />
        </View>
        <Text style={local.title} accessibilityRole="header">{t('staffRegister.title')}</Text>
        <Text style={local.subtitle}>{t('staffRegister.subtitle')}</Text>
      </GradientBackground>

      <ScrollView
        style={local.scroll}
        contentContainerStyle={local.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={theme.label}>{t('staffRegister.name')}</Text>
        <TextInput
          style={[theme.input, errors.name ? local.inputError : null]}
          value={name}
          onChangeText={(v) => { setName(v); clearErr('name'); }}
          placeholder={t('staffRegister.namePlaceholder')}
          placeholderTextColor={colors.muted}
          editable={!busy}
          accessibilityLabel={t('staffRegister.name')}
        />
        {errors.name ? <Text style={theme.fieldError}>{errors.name}</Text> : null}

        <Text style={theme.label}>{t('staffRegister.email')}</Text>
        <TextInput
          style={[theme.input, errors.email ? local.inputError : null]}
          value={email}
          onChangeText={(v) => { setEmail(v); clearErr('email'); }}
          placeholder={t('staffRegister.emailPlaceholder')}
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          accessibilityLabel={t('staffRegister.email')}
        />
        {errors.email ? <Text style={theme.fieldError}>{errors.email}</Text> : null}

        <Text style={theme.label}>{t('staffRegister.password')}</Text>
        <View style={local.passwordRow}>
          <TextInput
            style={[theme.input, local.passwordInput, errors.password ? local.inputError : null]}
            value={password}
            onChangeText={(v) => { setPassword(v); clearErr('password'); }}
            placeholder={t('staffRegister.passwordPlaceholder')}
            placeholderTextColor={colors.muted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel={t('staffRegister.password')}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            style={local.eyeBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t('staffLogin.hidePassword') : t('staffLogin.showPassword')}
          >
            <EyeIcon crossed={showPassword} color={colors.muted} />
          </Pressable>
        </View>
        {errors.password ? <Text style={theme.fieldError}>{errors.password}</Text> : null}

        <Text style={theme.label}>{t('staffRegister.confirmPassword')}</Text>
        <TextInput
          style={[theme.input, errors.confirm ? local.inputError : null]}
          value={confirm}
          onChangeText={(v) => { setConfirm(v); clearErr('confirm'); }}
          placeholder={t('staffRegister.confirmPlaceholder')}
          placeholderTextColor={colors.muted}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          accessibilityLabel={t('staffRegister.confirmPassword')}
        />
        {errors.confirm ? <Text style={theme.fieldError}>{errors.confirm}</Text> : null}

        <View style={local.selectWrap}>
          <SelectField
            label={t('staffRegister.role')}
            required
            placeholder={t('staffRegister.rolePlaceholder')}
            value={role}
            options={roleOptions}
            onChange={(v) => { setRole(v); clearErr('role'); }}
          />
          {errors.role ? <Text style={theme.fieldError}>{errors.role}</Text> : null}
        </View>

        <View style={local.selectWrap}>
          <SelectField
            label={t('staffRegister.organisation')}
            required
            placeholder={t('staffRegister.organisationPlaceholder')}
            value={organisationId}
            options={orgOptions}
            onChange={(v) => { setOrganisationId(v); clearErr('organisation'); }}
          />
          {errors.organisation ? <Text style={theme.fieldError}>{errors.organisation}</Text> : null}
        </View>

        {errors.form ? (
          <View style={local.errorBox} accessibilityRole="alert">
            <Text style={local.errorText}>{errors.form}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={busy}
          style={[theme.btnPrimary, busy && theme.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={submitting ? t('staffRegister.submitting') : t('staffRegister.submit')}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={theme.btnPrimaryText}>{t('staffRegister.submit')}</Text>
          )}
        </Pressable>

        <View style={local.orRow}>
          <View style={local.orLine} />
          <Text style={local.orText}>{t('staffRegister.or')}</Text>
          <View style={local.orLine} />
        </View>

        <Pressable
          onPress={onGoogle}
          disabled={busy}
          style={[local.googleBtn, busy && theme.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('staffRegister.google')}
        >
          {googleBusy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Svg width={18} height={18} viewBox="0 0 48 48">
                <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </Svg>
              <Text style={local.googleText}>{t('staffRegister.google')}</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.replace('/staff/login')}
          disabled={busy}
          style={theme.btnLink}
          accessibilityRole="button"
        >
          <Text style={theme.btnLinkText}>{t('staffRegister.haveAccount')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  logoWrap: { alignItems: 'center' },
  title: { marginTop: 16, fontSize: 26, fontWeight: '800', color: '#ffffff' },
  subtitle: { marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
  scroll: { flex: 1 },
  body: { padding: 24, paddingTop: 12, paddingBottom: 32 },
  selectWrap: { marginTop: 12 },
  inputError: { borderColor: colors.danger },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: 8, height: 44, width: 40, alignItems: 'center', justifyContent: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 13, color: colors.muted },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  googleText: { fontSize: 16, fontWeight: '700', color: colors.text },
  errorBox: { marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: colors.primaryTint },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.danger },
  // Success ("pending approval") state.
  doneBody: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  checkCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  doneTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  doneBodyText: { marginTop: 10, fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  doneBtn: { alignSelf: 'stretch', marginTop: 28 },
});
