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
 * TWO-FACTOR (TOTP): if a staffer has 2FA enabled, the password step returns a
 * one-time `mfa_token` (NOT a session) and the screen switches to a code-entry
 * step. The session is minted only once the 6-digit code (or a backup code) is
 * verified via staffLoginMfa, which stores it exactly like a normal login. The
 * mfa_token and the code live in state only and are never logged or persisted.
 *
 * All strings go through t(); all styling comes from theme tokens.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
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
import { loginStaff, loginStaffGoogle, staffLoginMfa, resendMfaCode } from '../../src/api/client';
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

  // Two-factor (TOTP) second step. When the password step returns a challenge we
  // hold the short-lived `mfaToken` here (component state ONLY, never persisted
  // or logged — same stance as the password) and switch the UI to the code-entry
  // step. `mfaCode` is the 6-digit authenticator code OR a backup code; the same
  // field/endpoint serves both, so the "use a backup code" affordance only
  // relaxes the numeric keypad rather than changing where the value goes.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  // Which second factor this account uses. 'email' swaps the prompt wording and
  // shows a "resend code" affordance; 'totp' asks for the authenticator code.
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('totp');
  const [resending, setResending] = useState(false);
  // A brief non-error confirmation (e.g. "a new code is on its way").
  const [mfaNotice, setMfaNotice] = useState<string | null>(null);

  // Whether the entered value is treated as an email/authenticator code (digits)
  // vs a backup code (free-form). Email codes are digits, same as TOTP.
  const isEmail = mfaMethod === 'email';

  // Already authenticated → do not show login to a logged-in staffer. Use the
  // <Redirect> component (not router.replace) so navigation is declarative and
  // never fires a setState on the navigator DURING this component's render.
  if (isAuthenticated) {
    return <Redirect href="/staff/reports" />;
  }

  const trimmedEmail = email.trim();
  const canSubmit = trimmedEmail.length > 0 && password.length > 0 && !submitting;

  // Open the self-service reset flow (email code → new password). The request
  // step is a no-oracle endpoint, so it never reveals whether an email exists.
  const onForgotPassword = () => {
    router.push('/staff/forgot-password');
  };

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
      const data = res.data.data;
      // Clear the password from state as soon as it has served its purpose,
      // whichever branch we take below.
      setPassword('');
      if ('mfa_required' in data) {
        // 2FA is enabled: the server withheld the session and issued a one-time
        // handle. Switch to the code-entry step; the session is minted only once
        // staffLoginMfa() succeeds. Never log the handle.
        setMfaToken(data.mfa_token);
        setMfaMethod(data.mfa_method === 'email' ? 'email' : 'totp');
        setMfaCode('');
        setMfaError(null);
        setMfaNotice(null);
        setUseBackupCode(false);
        return;
      }
      const { token, staff } = data;
      // AuthContext.login() stores the session AND arms the staff axios instance
      // (setStaffToken) — we never wire the token manually here.
      login({ token, staff });
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

  // Complete the second (TOTP) step. Exchanges the one-time mfaToken + the
  // entered code for the real session. On success it stores the session exactly
  // like a normal login (AuthContext.login arms staffApi). The server returns a
  // generic 401 for a bad/expired token or wrong code, so we show ONE generic
  // message and never reveal which failed. Never log the token, code or error.
  const onVerifyMfa = async () => {
    if (mfaSubmitting || !mfaToken) return;
    const code = mfaCode.trim();
    if (code.length === 0) return;
    setMfaSubmitting(true);
    setMfaError(null);
    try {
      const res = await staffLoginMfa(mfaToken, code);
      const { token, staff } = res.data.data;
      // Clear the second factor from state the moment it has served its purpose.
      setMfaCode('');
      setMfaToken(null);
      login({ token, staff });
      router.replace('/staff/reports');
    } catch (err) {
      // NEVER log err — it can echo the submitted code/token. Show the server's
      // generic message when present, else a generic fallback.
      let message = t('mfa.mfaFailed');
      if (axios.isAxiosError(err)) {
        const serverMessage = err.response?.data?.message;
        if (typeof serverMessage === 'string' && serverMessage.length > 0) {
          message = serverMessage;
        }
      }
      setMfaError(message);
    } finally {
      setMfaSubmitting(false);
    }
  };

  // Re-send the emailed code (email-method accounts only). Uses the same one-time
  // mfaToken; the server issues a fresh code and emails it. We show a brief notice
  // on success and a generic message on failure — never log the token or error.
  const onResendCode = async () => {
    if (resending || !mfaToken) return;
    setResending(true);
    setMfaError(null);
    setMfaNotice(null);
    try {
      await resendMfaCode(mfaToken);
      setMfaNotice(t('mfa.mfaResendSent'));
    } catch (err) {
      let message = t('mfa.mfaResendFailed');
      if (axios.isAxiosError(err)) {
        const serverMessage = err.response?.data?.message;
        if (typeof serverMessage === 'string' && serverMessage.length > 0) {
          message = serverMessage;
        }
      }
      setMfaError(message);
    } finally {
      setResending(false);
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

      {/* Top app bar: back + brand mark + wordmark on the navy bar. The screen
          title now sits as a big left-aligned headline in the body below. */}
      <View style={[local.appbar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => router.replace('/')}
          style={local.appbarBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 6 l-6 6 l6 6" stroke={colors.primaryText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <BrandLogo size={30} tintColor={colors.primaryText} accessibilityLabel={t('app.title')} />
        <Text style={local.appbarWordmark}>{t('app.title')}</Text>
      </View>

      {mfaToken ? (
        // ── Second step: TOTP / backup code entry ──
        <ScrollView
          style={local.scroll}
          contentContainerStyle={local.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={local.headline} accessibilityRole="header">{t('mfa.mfaTitle')}</Text>
          <Text style={local.bodySubtitle}>
            {isEmail ? t('mfa.mfaEmailCodePrompt') : t('mfa.mfaCodePrompt')}
          </Text>

          <Text style={theme.label} nativeID="mfaCodeLabel">
            {isEmail && !useBackupCode ? t('mfa.mfaEmailCodeLabel') : t('mfa.mfaCodeLabel')}
          </Text>
          <TextInput
            style={theme.input}
            value={mfaCode}
            onChangeText={(v) => {
              // An emailed / TOTP code is digits only; a backup code may include
              // letters and dashes, so only strip whitespace when in "code" mode.
              setMfaCode(useBackupCode ? v : v.replace(/[^0-9]/g, ''));
              if (mfaError) setMfaError(null);
              if (mfaNotice) setMfaNotice(null);
            }}
            placeholder={
              isEmail && !useBackupCode
                ? t('mfa.mfaEmailCodePrompt')
                : t('mfa.mfaCodePrompt')
            }
            placeholderTextColor={colors.muted}
            keyboardType={useBackupCode ? 'default' : 'number-pad'}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="oneTimeCode"
            maxLength={useBackupCode ? 32 : 6}
            returnKeyType="go"
            onSubmitEditing={onVerifyMfa}
            editable={!mfaSubmitting}
            autoFocus
            accessibilityLabel={t('mfa.mfaCodeLabel')}
            accessibilityLabelledBy="mfaCodeLabel"
          />

          {/* Generic failure — announced to screen readers. The server returns an
              identical 401 for a bad/expired token vs. a wrong code, so we never
              distinguish them here. */}
          {mfaError ? (
            <View style={local.errorBox} accessibilityRole="alert">
              <Text style={local.errorText}>{mfaError}</Text>
            </View>
          ) : null}

          {/* Brief, non-error confirmation after a successful resend. */}
          {mfaNotice ? (
            <View style={local.noticeBox} accessibilityRole="alert">
              <Text style={local.noticeText}>{mfaNotice}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onVerifyMfa}
            disabled={mfaCode.trim().length === 0 || mfaSubmitting}
            style={[
              theme.btnPrimary,
              (mfaCode.trim().length === 0 || mfaSubmitting) && theme.btnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              mfaSubmitting ? t('mfa.mfaVerifying') : t('mfa.mfaVerify')
            }
            accessibilityState={{
              disabled: mfaCode.trim().length === 0 || mfaSubmitting,
              busy: mfaSubmitting,
            }}
          >
            {mfaSubmitting ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={theme.btnPrimaryText}>{t('mfa.mfaVerify')}</Text>
            )}
          </Pressable>

          {/* Email-method only: resend the code if it didn't arrive. Hidden while
              entering a backup code (there is nothing to resend for those). */}
          {isEmail && !useBackupCode ? (
            <Pressable
              onPress={onResendCode}
              disabled={resending || mfaSubmitting}
              style={theme.btnLink}
              accessibilityRole="button"
              accessibilityLabel={resending ? t('mfa.mfaResending') : t('mfa.mfaResend')}
              accessibilityState={{ disabled: resending || mfaSubmitting, busy: resending }}
            >
              <Text style={theme.btnLinkText}>
                {resending ? t('mfa.mfaResending') : t('mfa.mfaResend')}
              </Text>
            </Pressable>
          ) : null}

          {/* "Use a backup code instead" — SAME field + endpoint; this only
              switches the keypad/validation so a backup code can be typed. */}
          <Pressable
            onPress={() => {
              setUseBackupCode((v) => !v);
              setMfaCode('');
              setMfaError(null);
              setMfaNotice(null);
            }}
            disabled={mfaSubmitting}
            style={theme.btnLink}
            accessibilityRole="button"
            accessibilityLabel={t('mfa.mfaUseBackup')}
          >
            <Text style={theme.btnLinkText}>{t('mfa.mfaUseBackup')}</Text>
          </Pressable>
        </ScrollView>
      ) : (
      <ScrollView
        style={local.scroll}
        contentContainerStyle={local.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={local.headline} accessibilityRole="header">{t('staffLogin.title')}</Text>
        <Text style={local.bodySubtitle}>{t('staffLogin.subtitle')}</Text>

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

        {/* Forgot password — staff accounts are admin-managed, so this explains how
            to get a reset rather than exposing a self-serve reset (no oracle). */}
        <Pressable
          onPress={onForgotPassword}
          style={local.forgotRow}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('staffLogin.forgotPassword')}
        >
          <Text style={local.forgotText}>{t('staffLogin.forgotPassword')}</Text>
        </Pressable>

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
      )}
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // Top app bar: back + logo + wordmark on the navy bar.
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.primary,
  },
  appbarBack: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  appbarWordmark: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: 0.3,
  },
  // Big left-aligned screen headline + supporting line in the white body.
  headline: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  bodySubtitle: { fontSize: 15, color: colors.muted, marginBottom: 18 },
  // Right-aligned "Forgot password?" link under the password field.
  forgotRow: { alignSelf: 'flex-end', paddingVertical: 6, marginTop: 2 },
  forgotText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  scroll: { flex: 1 },
  body: { padding: 24, paddingTop: 20 },
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
  // Non-error confirmation (e.g. after a resend) — uses the brand tint, not red.
  noticeBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
    fontWeight: '600',
  },
});
