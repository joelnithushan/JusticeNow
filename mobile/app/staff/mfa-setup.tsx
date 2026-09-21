/**
 * JusticeNow (mobile) — Staff two-factor (TOTP) enrolment. Route: /staff/mfa-setup.
 *
 * WHY THIS EXISTS: staff accounts guard confidential case data, so a staffer may
 * add a second factor. This screen walks them through it:
 *   1. setupMfa() → the server provisions a pending TOTP secret and returns a QR
 *      (a ready-to-render data-URL PNG) plus the otpauth URL as a copyable
 *      fallback. We render the QR with the BUILT-IN <Image> component from the
 *      data-URL — no camera/QR native module is involved on this screen.
 *   2. The staffer scans the QR with an authenticator app and types the 6-digit
 *      code it shows.
 *   3. activateMfa(code) → on success 2FA is on and the server returns one-time
 *      BACKUP CODES, shown ONCE with a "save these" warning + confirm.
 *
 * PRIVACY / LEAVE NO TRACE: the QR, otpauth URL, code and backup codes all live
 * in component state ONLY. Nothing is persisted to device storage, and none of
 * it is ever logged — the backup codes especially are the only fallback if the
 * authenticator device is lost, so re-displaying or storing them is forbidden.
 *
 * Reached only from the authenticated profile tab; a 401 from either call means
 * the session expired, so we drop it and bounce to login (tokens are never
 * persisted — see AuthContext). All strings go through t(); styling from theme.
 */

import React, { useCallback, useState } from 'react';
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

import StaffHeader from '../../components/StaffHeader';
import { setupMfa, activateMfa } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { colors, styles as theme } from '../../src/theme';

// The three states of the flow: kicking off the setup call, scanning + entering
// a code, and finally showing the backup codes once activation succeeds.
type Phase = 'intro' | 'scan' | 'backup';

export default function StaffMfaSetup() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();

  const [phase, setPhase] = useState<Phase>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup data (QR data-URL + otpauth fallback) and the entered code. State only.
  const [qr, setQr] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');

  // The one-time backup codes returned on activation. Shown ONCE; never stored.
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const goToLogin = useCallback(() => {
    // In-memory token expired/invalid — drop it so nothing lingers, then require
    // a fresh sign-in (tokens are never persisted; see AuthContext).
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  // Map an axios error to a message: treat a 401 as an expired session (bounce to
  // login), prefer the server's message, else a generic fallback. Never log err.
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

  const onBegin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await setupMfa();
      // Hold the QR + fallback in state only; both are discarded when we leave.
      setQr(res.data.data.qr);
      setOtpauthUrl(res.data.data.otpauth_url);
      setPhase('scan');
    } catch (err) {
      const message = messageFor(err, t('mfa.mfaFailed'));
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, messageFor, t]);

  const onActivate = useCallback(async () => {
    if (busy) return;
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await activateMfa(trimmed);
      // Show the backup codes ONCE. Clear the code from state immediately.
      setCode('');
      setBackupCodes(res.data.data.backup_codes);
      setPhase('backup');
    } catch (err) {
      // NEVER log err — it can echo the submitted code. Generic message on failure.
      const message = messageFor(err, t('mfa.mfaFailed'));
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, code, messageFor, t]);

  const onDone = useCallback(() => {
    // Drop the backup codes from state as we leave — they are never persisted.
    setBackupCodes([]);
    router.back();
  }, [router]);

  return (
    <View style={local.screen}>
      <StaffHeader title={t('mfa.mfaSetupTitle')} />
      <ScrollView
        contentContainerStyle={[local.body, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={local.errorBox} accessibilityRole="alert">
            <Text style={local.errorText}>{error}</Text>
          </View>
        ) : null}

        {phase === 'intro' ? (
          <>
            <Text style={theme.paragraph}>{t('mfa.mfaSetupSteps')}</Text>
            <Pressable
              onPress={onBegin}
              disabled={busy}
              style={[theme.btnPrimary, busy && theme.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('mfa.mfaEnable')}
              accessibilityState={{ disabled: busy, busy }}
            >
              {busy ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={theme.btnPrimaryText}>{t('mfa.mfaEnable')}</Text>
              )}
            </Pressable>
          </>
        ) : null}

        {phase === 'scan' ? (
          <>
            <Text style={theme.paragraph}>{t('mfa.mfaSetupSteps')}</Text>

            {/* QR rendered from the server's data-URL PNG via the BUILT-IN Image
                component — no QR/camera native module is added. */}
            {qr ? (
              <View style={local.qrWrap}>
                <Image
                  source={{ uri: qr }}
                  style={local.qr}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                  accessibilityLabel={t('mfa.mfaSetupTitle')}
                />
              </View>
            ) : null}

            {/* Text fallback for staffers who cannot scan — the otpauth URL can be
                typed/pasted into an authenticator by hand. Selectable so it can be
                copied; never logged. */}
            {otpauthUrl ? (
              <Text style={local.otpauth} selectable accessibilityLabel={otpauthUrl}>
                {otpauthUrl}
              </Text>
            ) : null}

            <Text style={theme.label} nativeID="mfaSetupCodeLabel">
              {t('mfa.mfaCodeLabel')}
            </Text>
            <TextInput
              style={theme.input}
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/[^0-9]/g, ''));
                if (error) setError(null);
              }}
              placeholder={t('mfa.mfaCodePrompt')}
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="oneTimeCode"
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={onActivate}
              editable={!busy}
              accessibilityLabel={t('mfa.mfaCodeLabel')}
              accessibilityLabelledBy="mfaSetupCodeLabel"
            />

            <Pressable
              onPress={onActivate}
              disabled={code.trim().length === 0 || busy}
              style={[
                theme.btnPrimary,
                (code.trim().length === 0 || busy) && theme.btnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={busy ? t('mfa.mfaVerifying') : t('mfa.mfaVerify')}
              accessibilityState={{
                disabled: code.trim().length === 0 || busy,
                busy,
              }}
            >
              {busy ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={theme.btnPrimaryText}>{t('mfa.mfaVerify')}</Text>
              )}
            </Pressable>
          </>
        ) : null}

        {phase === 'backup' ? (
          <>
            <View style={local.successBox} accessibilityRole="alert">
              <Text style={local.successText}>{t('mfa.mfaEnabledMsg')}</Text>
            </View>

            <Text style={local.backupTitle} accessibilityRole="header">
              {t('mfa.mfaBackupTitle')}
            </Text>
            {/* Warning explaining that these are one-time and must be saved. */}
            <Text style={theme.paragraph}>{t('mfa.mfaBackupHint')}</Text>

            {/* The codes themselves — shown once, selectable so they can be copied
                by hand, never persisted by us. */}
            <View style={local.codesBox}>
              {backupCodes.map((c) => (
                <Text key={c} style={local.codeText} selectable>
                  {c}
                </Text>
              ))}
            </View>

            <Pressable
              onPress={onDone}
              style={theme.btnPrimary}
              accessibilityRole="button"
              accessibilityLabel={t('mfa.mfaBackupDone')}
            >
              <Text style={theme.btnPrimaryText}>{t('mfa.mfaBackupDone')}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20 },
  qrWrap: { alignItems: 'center', marginVertical: 16 },
  qr: {
    width: 220,
    height: 220,
    backgroundColor: colors.background,
  },
  otpauth: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
    // Monospace so the secret is easy to read/verify when typed by hand.
    fontFamily: 'monospace',
  },
  backupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  codesBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    backgroundColor: colors.primaryTint,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 16,
    color: colors.text,
    fontFamily: 'monospace',
    paddingVertical: 4,
    letterSpacing: 1,
  },
  errorBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.danger },
  successBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  successText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
    fontWeight: '600',
  },
});
