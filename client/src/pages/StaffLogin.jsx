/**
 * JusticeNow (web) — Staff login (real form).
 *
 * WHY THIS EXISTS (threat model): ONLY staff (attorney / NGO officer / admin)
 * ever authenticate — reporters are anonymous by construction and never log in.
 * This page mints the session; on success AuthContext.login() stores the token
 * in memory and arms the SEPARATE staff axios instance (setStaffToken).
 *
 * PRIVACY / LEAVE NO TRACE:
 *  - Email + password live in component state ONLY and are never logged.
 *  - We never log the response, the token, or whether the email exists.
 *  - Nothing is persisted to the device — a reload drops the session, by design
 *    (see AuthContext). So a lost/stale token simply means "sign in again".
 *
 * NO-ORACLE: the server returns an identical generic message for bad email vs.
 * bad password, so we display whatever message it gives (falling back to a
 * generic string) and never try to distinguish the two cases in the UI.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { loginStaff, loginStaffGoogle, staffLoginMfa } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import './StaffLogin.css';

function StaffLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');

  // Second-factor challenge state. When the password step returns
  // mfa_required, we hold the server's short-lived mfa_token (a challenge
  // handle, NOT a session) in memory and switch the form to a code-entry step.
  // The mfa_token is never logged and never persisted — same leave-no-trace
  // stance as the password.
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');

  // After the Google redirect, Supabase drops the session into the URL fragment
  // and detectSessionInUrl reads it. Exchange that session for OUR JWT here: the
  // server only issues one if the Google email is an active staff member. The
  // Supabase session is not persisted (see api/supabase.js) — we discard it
  // immediately after the exchange, matching the leave-no-trace staff model.
  const exchangeGoogleSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session) return;

    setGoogleBusy(true);
    setError('');
    try {
      const res = await loginStaffGoogle(session.access_token);
      const { token, staff } = res.data.data;
      login({ token, staff });
      navigate('/staff/reports', { replace: true });
    } catch (err) {
      // Not a staff member / failed exchange → drop the Supabase session so we
      // don't loop, and show the server's message. Never log err (may echo email).
      await supabase.auth.signOut();
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
  }, [login, navigate, t]);

  useEffect(() => {
    exchangeGoogleSession();
  }, [exchangeGoogleSession]);

  const signInWithGoogle = async () => {
    setError('');
    // Redirect back to this page; the effect above completes the exchange.
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/staff/login` },
    });
  };

  // Already authenticated → never show login to a signed-in staffer. Redirect
  // straight into the guarded reports list (declarative <Navigate> avoids
  // navigating during render).
  if (isAuthenticated) {
    return <Navigate to="/staff/reports" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await loginStaff(trimmedEmail, password);
      const data = res.data.data;
      // Clear the password from state as soon as it has served its purpose.
      setPassword('');
      // 2FA on: the server has NOT minted a session yet — it returned only a
      // short-lived mfa_token. Do NOT store anything; switch to the code-entry
      // step and let the staffer finish the challenge.
      if (data.mfa_required) {
        setMfaToken(data.mfa_token);
        setMfaCode('');
        setMfaError('');
        return;
      }
      const { token, staff } = data;
      // AuthContext.login() stores the session AND arms the staff axios instance
      // (setStaffToken) — we never wire the token manually here.
      login({ token, staff });
      navigate('/staff/reports', { replace: true });
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

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  // Second step: verify the 6-digit TOTP (or a backup code — the server accepts
  // either value in `code`). On success the server mints the real session and
  // we store it exactly like a normal login (same AuthContext.login path).
  const handleMfaSubmit = async (e) => {
    e.preventDefault();

    const trimmedCode = mfaCode.trim();
    if (!trimmedCode || submitting) return;

    setSubmitting(true);
    setMfaError('');

    try {
      const res = await staffLoginMfa(mfaToken, trimmedCode);
      const { token, staff } = res.data.data;
      // Clear the code and challenge handle now they have served their purpose.
      setMfaCode('');
      setMfaToken(null);
      login({ token, staff });
      navigate('/staff/reports', { replace: true });
    } catch (err) {
      // NEVER log err — it can echo the submitted code. Show a generic message
      // (bad code vs. expired/used token look identical to the user, matching
      // the no-oracle stance). A 401 leaves the code-entry step in place so the
      // staffer can retry.
      setMfaError(t('mfa.mfaFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const canVerify = mfaCode.trim().length > 0 && !submitting;

  // Second factor pending — render the code-entry step instead of the password
  // form. We never showed/stored a session for this account yet.
  if (mfaToken) {
    return (
      <div className="page staff-login">
        <h1>{t('mfa.mfaTitle')}</h1>
        <p className="tagline">{t('mfa.mfaCodePrompt')}</p>

        <form onSubmit={handleMfaSubmit} noValidate>
          <label htmlFor="staffMfaCode">{t('mfa.mfaCodeLabel')}</label>
          <input
            id="staffMfaCode"
            type="text"
            value={mfaCode}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            disabled={submitting}
            onChange={(e) => setMfaCode(e.target.value)}
          />

          {/* Generic failure — announced to screen readers. Never reveals
              whether the code or the challenge token was the problem. */}
          {mfaError && (
            <p className="field-error" role="alert">{mfaError}</p>
          )}

          <button type="submit" className="btn btn-primary" disabled={!canVerify}>
            {submitting ? t('mfa.mfaVerifying') : t('mfa.mfaVerify')}
          </button>
        </form>

        {/* A backup code is just another value in `code` — same input, same
            endpoint. This affordance only clarifies that for the user; it puts
            the (already labelled) field back in focus. */}
        <button
          type="button"
          className="btn btn-link"
          onClick={() => {
            setMfaError('');
            document.getElementById('staffMfaCode')?.focus();
          }}
        >
          {t('mfa.mfaUseBackup')}
        </button>
      </div>
    );
  }

  return (
    <div className="page staff-login">
      <h1>{t('staffLogin.title')}</h1>
      <p className="tagline">{t('staffLogin.subtitle')}</p>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="staffEmail">{t('staffLogin.email')}</label>
        <input
          id="staffEmail"
          type="email"
          value={email}
          placeholder={t('staffLogin.emailPlaceholder')}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          disabled={submitting}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="staffPassword">{t('staffLogin.password')}</label>
        <div className="password-field">
          <input
            id="staffPassword"
            type={showPassword ? 'text' : 'password'}
            value={password}
            placeholder={t('staffLogin.passwordPlaceholder')}
            autoComplete="current-password"
            disabled={submitting}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t('staffLogin.hidePassword') : t('staffLogin.showPassword')}
            title={showPassword ? t('staffLogin.hidePassword') : t('staffLogin.showPassword')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              {showPassword && <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            </svg>
          </button>
        </div>

        {/* Generic failure — announced to screen readers. Never reveals whether
            the email exists (the server already returns a generic message). */}
        {error && (
          <p className="field-error" role="alert">{error}</p>
        )}

        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {submitting ? t('staffLogin.signingIn') : t('staffLogin.signIn')}
        </button>
      </form>

      <div className="or-divider"><span>{t('staffLogin.or')}</span></div>

      {/* Sign in with Google — via Supabase Auth. Only works if the Google email
          is already an active staff_users member (server-enforced). */}
      <button
        type="button"
        className="btn btn-google"
        onClick={signInWithGoogle}
        disabled={submitting || googleBusy}
      >
        <svg className="google-g" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {googleBusy ? t('staffLogin.googleBusy') : t('staffLogin.google')}
      </button>

      {/* Staff area intentionally has no Quick Exit chrome — a plain back-to-home
          link instead (a staffer is not a survivor fleeing a shared device). */}
      <Link to="/" className="btn btn-link">{t('staffLogin.backHome')}</Link>
    </div>
  );
}

export default StaffLogin;
