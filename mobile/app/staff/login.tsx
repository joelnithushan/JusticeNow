/**
 * JusticeNow (mobile) — Staff login (real form).
 *
 * WHY THIS EXISTS (threat model): ONLY staff (attorney / NGO officer / admin)
 * ever authenticate — reporters are anonymous by construction and never log in.
 * Because this is the staff side, the reporter safety chrome differs: there is
 * NO global Quick Exit button on /staff screens (a staffer working a dashboard
 * is not a survivor fleeing a shared device), so we provide a plain Back-to-home
 * affordance instead. That absence is intentional, not an omission.
 *
 * PRIVACY / LEAVE NO TRACE:
 *  - Email + password live in component state ONLY and are never logged.
 *  - We never log the response, the token, or whether the email exists.
 *  - The token is handed to AuthContext.login(), which arms the SEPARATE staff
 *    axios instance via setStaffToken(); we never touch the token by hand here.
 *  - Nothing is persisted to the device — a cold start drops the session, by
 *    design (see AuthContext).
 *
 * NO-ORACLE: the server returns an identical generic message for bad email vs.
 * bad password, so we simply display whatever message it gives (falling back to
 * a generic string) and never try to distinguish the two cases in the UI.
 *
 * All strings go through t(); all styling comes from theme tokens.
 */

import React, { useState } from 'react';
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
import { useAuth } from '../../src/context/AuthContext';
import { loginStaff, loginStaffGoogle } from '../../src/api/client';
import { supabase } from '../../src/api/supabase';
import { colors, styles as theme } from '../../src/theme';

// Ensure the in-app browser auth session dismisses cleanly after the redirect.
WebBrowser.maybeCompleteAuthSession();

// Shape check only — never used to decide whether an account exists (that would
// be an oracle). The server remains the authority and returns a generic message.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Left-pointing arrow for the "Back to home" affordance.
function BackArrowIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12 H5 M11 6 l-6 6 l6 6"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Pull a param from an OAuth redirect URL — Supabase's implicit flow returns the
// tokens in the URL fragment (after #), so check the fragment first, then query.
function paramFromUrl(url: string, key: string): string | null {
  const hash = url.includes('#') ? url.split('#')[1] : '';
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const fromHash = new URLSearchParams(hash).get(key);
  if (fromHash) return fromHash;
  return new URLSearchParams(query).get(key);
}

export default function StaffLogin() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-field, client-side validation errors (empty / malformed). Shown UNDER
  // the relevant field. Distinct from `error`, which is the server's generic
  // auth-failure message (kept generic on purpose — no-oracle).
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Already authenticated → do not show login to a logged-in staffer. Redirect
  // straight into the guarded tabs. useRouter().replace inside render is safe
  // here because expo-router defers navigation until after mount.
  if (isAuthenticated) {
    router.replace('/staff/reports');
    return null;
  }

  const trimmedEmail = email.trim();
  const canSubmit = trimmedEmail.length > 0 && password.length > 0 && !submitting;

  const onSubmit = async () => {
    // Validate the SHAPE of the input first and show any problem under the
    // field. This never reveals whether the email is registered — it only
    // checks what was typed — so the no-oracle property is preserved.
    const nextEmailError = !trimmedEmail
      ? t('staffLogin.emailRequired')
      : !EMAIL_RE.test(trimmedEmail)
        ? t('staffLogin.emailInvalid')
        : null;
    const nextPasswordError = password.length === 0 ? t('staffLogin.passwordRequired') : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await loginStaff(trimmedEmail, password);
      const { token, staff } = res.data.data;
      // AuthContext.login() stores the session AND arms the staff axios instance
      // (setStaffToken) — we never wire the token manually here.
      login({ token, staff });
      // Clear the password from state as soon as it has served its purpose.
      setPassword('');
      router.replace('/staff/reports');
    } catch (err) {
      // NEVER log err — it can echo the submitted email/credentials. Show the
      // server's generic message (identical for bad email vs. bad password) if
      // present, otherwise a generic fallback. Do not reveal which was wrong.
      let message = t('staffLogin.failed');
      if (axios.isAxiosError(err)) {
        const serverMessage = err.response?.data?.message;
        if (typeof serverMessage === 'string' && serverMessage.length > 0) {
          message = serverMessage;
        }
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Sign in with Google via Supabase Auth. We ask Supabase for the provider URL
  // (skipBrowserRedirect), open it in the system auth browser, then read the
  // access token from the redirect URL fragment and exchange it for OUR JWT via
  // the backend — which only issues one if the Google email is active staff.
  // Nothing is persisted; the Supabase session is used once and discarded.
  const onGoogle = async () => {
    if (googleBusy || submitting) return;
    setGoogleBusy(true);
    setError(null);
    try {
      const redirectTo = Linking.createURL('/staff/login');
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthError || !data?.url) throw oauthError ?? new Error('No auth URL');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        // User dismissed/cancelled the browser — no error, just stop.
        return;
      }

      const accessToken = paramFromUrl(result.url, 'access_token');
      if (!accessToken) throw new Error('No access token in redirect');

      const res = await loginStaffGoogle(accessToken);
      const { token, staff } = res.data.data;
      login({ token, staff });
      router.replace('/staff/reports');
    } catch (err) {
      // Never log err. Show the server's message (e.g. "not a registered staff
      // member") if present, else a generic Google failure message.
      let message = t('staffLogin.googleFailed');
      if (axios.isAxiosError(err)) {
        const serverMessage = err.response?.data?.message;
        if (typeof serverMessage === 'string' && serverMessage.length > 0) {
          message = serverMessage;
        }
      }
      setError(message);
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <View style={local.screen}>
      <StatusBar style="light" />

      {/* Professional staff header: brand mark on the navy→teal gradient, matching
          the preferences screen so the app feels consistent across surfaces. */}
      <GradientBackground
        id="staff-login-header"
        style={[local.header, { paddingTop: insets.top + 20 }]}
      >
        {/* Logo centred horizontally, with a raised 3D badge (see BrandLogo). */}
        <View style={local.logoWrap}>
          <BrandLogo size={68} variant="chip" accessibilityLabel={t('app.title')} />
        </View>
        <Text style={local.title} accessibilityRole="header">
          {t('staffLogin.title')}
        </Text>
        <Text style={local.subtitle}>{t('staffLogin.subtitle')}</Text>
      </GradientBackground>

      <ScrollView
        style={local.scroll}
        contentContainerStyle={local.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={theme.label} nativeID="staffEmailLabel">
          {t('staffLogin.email')}
        </Text>
        <TextInput
          style={[theme.input, emailError ? local.inputError : null]}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (emailError) setEmailError(null);
          }}
          placeholder={t('staffLogin.emailPlaceholder')}
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="username"
          returnKeyType="next"
          editable={!submitting}
          accessibilityLabel={t('staffLogin.email')}
          accessibilityLabelledBy="staffEmailLabel"
        />
        {emailError ? (
          <Text style={theme.fieldError} accessibilityRole="alert">
            {emailError}
          </Text>
        ) : null}

        <Text style={theme.label} nativeID="staffPasswordLabel">
          {t('staffLogin.password')}
        </Text>
        <View style={local.passwordRow}>
          <TextInput
            style={[theme.input, local.passwordInput, passwordError ? local.inputError : null]}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (passwordError) setPasswordError(null);
            }}
            placeholder={t('staffLogin.passwordPlaceholder')}
            placeholderTextColor={colors.muted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            editable={!submitting}
            accessibilityLabel={t('staffLogin.password')}
            accessibilityLabelledBy="staffPasswordLabel"
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            style={local.eyeBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              showPassword ? t('staffLogin.hidePassword') : t('staffLogin.showPassword')
            }
          >
            <EyeIcon crossed={showPassword} color={colors.muted} />
          </Pressable>
        </View>
        {passwordError ? (
          <Text style={theme.fieldError} accessibilityRole="alert">
            {passwordError}
          </Text>
        ) : null}

        {/* Generic failure — announced to screen readers. Never reveals whether
            the email exists (the server already returns a generic message). */}
        {error ? (
          <View style={local.errorBox} accessibilityRole="alert">
            <Text style={local.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[theme.btnPrimary, !canSubmit && theme.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={
            submitting ? t('staffLogin.signingIn') : t('staffLogin.signIn')
          }
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={theme.btnPrimaryText}>{t('staffLogin.signIn')}</Text>
          )}
        </Pressable>

        {/* "or" divider + Google sign-in (via Supabase Auth). Only succeeds if
            the Google email is an active staff member (server-enforced). */}
        <View style={local.orRow}>
          <View style={local.orLine} />
          <Text style={local.orText}>{t('staffLogin.or')}</Text>
          <View style={local.orLine} />
        </View>

        <Pressable
          onPress={onGoogle}
          disabled={googleBusy || submitting}
          style={[local.googleBtn, (googleBusy || submitting) && theme.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('staffLogin.google')}
          accessibilityState={{ disabled: googleBusy || submitting, busy: googleBusy }}
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
              <Text style={local.googleText}>{t('staffLogin.google')}</Text>
            </>
          )}
        </Pressable>

        {/* Self-service signup → creates a PENDING account (admin approves). */}
        <Pressable
          onPress={() => router.push('/staff/register')}
          disabled={submitting || googleBusy}
          style={theme.btnLink}
          accessibilityRole="button"
          accessibilityLabel={t('staffLogin.createAccount')}
        >
          <Text style={theme.btnLinkText}>{t('staffLogin.createAccount')}</Text>
        </Pressable>
      </ScrollView>

      {/* "Back to home" pinned to the bottom (with a back arrow) so it stays
          within easy thumb reach regardless of how tall the form scrolls. */}
      <View style={[local.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => router.replace('/')}
          disabled={submitting}
          style={local.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('staffLogin.backHome')}
        >
          <BackArrowIcon color={colors.primary} />
          <Text style={local.backText}>{t('staffLogin.backHome')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  logoWrap: { alignItems: 'center' },
  title: { marginTop: 18, fontSize: 28, fontWeight: '800', color: '#ffffff' },
  subtitle: { marginTop: 6, fontSize: 15, color: 'rgba(255,255,255,0.9)' },
  scroll: { flex: 1 },
  body: { padding: 24, paddingTop: 12 },
  // Bottom-pinned back affordance, separated from the form by a hairline.
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  backText: { fontSize: 16, fontWeight: '700', color: colors.primary },
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
  passwordRow: { justifyContent: 'center' },
  // Leave room on the right so the code text never sits under the eye button.
  passwordInput: { paddingRight: 48 },
  // Red outline on a field that failed client-side validation.
  inputError: { borderColor: colors.danger },
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
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
  },
});
