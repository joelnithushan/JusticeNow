/**
 * JusticeNow (mobile) — Staff password reset. Route: /staff/forgot-password.
 *
 * For NORMAL email/password staff accounts (Google accounts have no password). Two
 * steps in one screen:
 *   1. 'request' — enter the staff email → the server emails a 6-digit code. The
 *      response is ALWAYS generic (no oracle: it never reveals if the email exists).
 *   2. 'reset'   — enter the code + a new password → the server verifies and sets it.
 *
 * PRIVACY: nothing is persisted on the device; the code/password live in component
 * state only and are never logged.
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
import axios from 'axios';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import BrandLogo from '../../components/BrandLogo';
import { requestPasswordReset, resetStaffPassword } from '../../src/api/client';
import { colors, styles as theme } from '../../src/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Phase = 'request' | 'reset';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const trimmedEmail = email.trim();

  // Step 1: ask the server to email a code, then move to the reset step. The
  // response is generic, so we always advance (never reveal if the email exists).
  const onRequest = async () => {
    if (busy) return;
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError(t('staffLogin.emailInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(trimmedEmail);
    } catch {
      // Never surface — keep the no-oracle behaviour; still advance.
    } finally {
      setBusy(false);
    }
    setNotice(t('forgotPw.sentNotice'));
    setPhase('reset');
  };

  // Step 2: verify the code and set the new password, then return to login.
  const onReset = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('forgotPw.codeInvalid'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('forgotPw.tooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('forgotPw.mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetStaffPassword(trimmedEmail, code.trim(), password);
      // Clear sensitive state before leaving.
      setPassword('');
      setConfirm('');
      setCode('');
      router.replace('/staff/login');
    } catch (err) {
      let message = t('forgotPw.genericError');
      if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
        message = err.response.data.message;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={local.screen}>
      <StatusBar style="light" />
      {/* App bar: back + logo + wordmark (matches login/register). */}
      <View style={[local.appbar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => router.replace('/staff/login')}
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

      <ScrollView
        contentContainerStyle={local.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={local.headline} accessibilityRole="header">{t('forgotPw.title')}</Text>
        <Text style={local.bodySubtitle}>
          {phase === 'request' ? t('forgotPw.intro') : t('forgotPw.resetIntro')}
        </Text>

        {notice ? (
          <View style={local.noticeBox} accessibilityRole="alert">
            <Text style={local.noticeText}>{notice}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={local.errorBox} accessibilityRole="alert">
            <Text style={local.errorText}>{error}</Text>
          </View>
        ) : null}

        {phase === 'request' ? (
          <>
            <Text style={theme.label}>{t('staffLogin.email')}</Text>
            <TextInput
              style={theme.input}
              value={email}
              onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
              placeholder={t('staffLogin.emailPlaceholder')}
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="go"
              onSubmitEditing={onRequest}
              editable={!busy}
              accessibilityLabel={t('staffLogin.email')}
            />
            <Pressable
              onPress={onRequest}
              disabled={busy}
              style={[theme.btnPrimary, busy && theme.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('forgotPw.sendCode')}
            >
              {busy ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={theme.btnPrimaryText}>{t('forgotPw.sendCode')}</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={theme.label}>{t('forgotPw.codeLabel')}</Text>
            <TextInput
              style={theme.input}
              value={code}
              onChangeText={(v) => { setCode(v.replace(/[^0-9]/g, '')); if (error) setError(null); }}
              placeholder={t('forgotPw.codePlaceholder')}
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="off"
              textContentType="oneTimeCode"
              editable={!busy}
              accessibilityLabel={t('forgotPw.codeLabel')}
            />

            <Text style={theme.label}>{t('forgotPw.newPasswordLabel')}</Text>
            <TextInput
              style={theme.input}
              value={password}
              onChangeText={(v) => { setPassword(v); if (error) setError(null); }}
              placeholder={t('forgotPw.newPasswordPlaceholder')}
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              editable={!busy}
              accessibilityLabel={t('forgotPw.newPasswordLabel')}
            />

            <Text style={theme.label}>{t('forgotPw.confirmLabel')}</Text>
            <TextInput
              style={theme.input}
              value={confirm}
              onChangeText={(v) => { setConfirm(v); if (error) setError(null); }}
              placeholder={t('forgotPw.confirmPlaceholder')}
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="go"
              onSubmitEditing={onReset}
              editable={!busy}
              accessibilityLabel={t('forgotPw.confirmLabel')}
            />

            <Pressable
              onPress={onReset}
              disabled={busy}
              style={[theme.btnPrimary, busy && theme.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('forgotPw.reset')}
            >
              {busy ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={theme.btnPrimaryText}>{t('forgotPw.reset')}</Text>
              )}
            </Pressable>

            {/* Re-request a code (goes back to step 1). */}
            <Pressable
              onPress={() => { setPhase('request'); setError(null); setNotice(null); }}
              disabled={busy}
              style={theme.btnLink}
              accessibilityRole="button"
              accessibilityLabel={t('forgotPw.resend')}
            >
              <Text style={theme.btnLinkText}>{t('forgotPw.resend')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.primary,
  },
  appbarBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  appbarWordmark: { fontSize: 20, fontWeight: '800', color: colors.primaryText, letterSpacing: 0.3 },
  body: { padding: 24, paddingTop: 20 },
  headline: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.4, marginBottom: 6 },
  bodySubtitle: { fontSize: 15, color: colors.muted, lineHeight: 21, marginBottom: 18 },
  noticeBox: { marginBottom: 14, padding: 12, borderRadius: 8, backgroundColor: colors.primaryTint },
  noticeText: { fontSize: 14, lineHeight: 20, color: colors.primary, fontWeight: '600' },
  errorBox: { marginBottom: 14, padding: 12, borderRadius: 8, backgroundColor: '#FDECEC' },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.danger },
});
