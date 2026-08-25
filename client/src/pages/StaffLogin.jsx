/**
 * JusticeNow — Staff login page.
 *
 * CRITICAL CONTEXT:
 *   Only STAFF log in — legal aid attorneys and NGO advocacy officers.
 *   Reporters NEVER authenticate. This page must never be linked from any
 *   reporter-facing flow. The only entry point is the home page "Staff login" link.
 *
 * DESIGN DECISIONS:
 *   - Deliberately plain UI — this is an internal tool, not a public page.
 *   - NO "Forgot password" / "Create account" links — accounts are provisioned
 *     by an administrator. Self-registration is not permitted (JNOW-32 AC).
 *   - Generic error on failure: "Those details didn't match" — this prevents
 *     email enumeration (an attacker cannot tell whether an email is registered).
 *   - Inline per-field validation on blur (not just on submit) for usability.
 *   - If already authenticated, redirect straight to /staff/reports.
 *
 * ALL user-facing strings use react-i18next so they can be translated.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Basic email format check — not exhaustive, just catches obvious typos. */
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// ── Component ─────────────────────────────────────────────────────────────────

function StaffLogin() {
  const { t }           = useTranslation();
  const { user, login } = useAuth();
  const navigate        = useNavigate();

  // ── Form state ────────────────────────────────────────────────────────────
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Per-field inline errors (shown after blur or on submit attempt)
  const [emailError, setEmailError]       = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Server-level auth error (generic, never reveals whether the email exists)
  const [authError, setAuthError]   = useState('');

  // True while the sign-in request is in flight — disables the submit button
  const [submitting, setSubmitting] = useState(false);

  // ── Redirect if already logged in ─────────────────────────────────────────
  // If the staff member refreshes /staff/login while already authenticated,
  // send them straight to the reports list without showing the form.
  useEffect(() => {
    if (user) navigate('/staff/reports', { replace: true });
  }, [user, navigate]);

  // ── Validation helpers ────────────────────────────────────────────────────

  /** Validates the email field and sets (or clears) its error. Returns valid flag. */
  const validateEmail = (value) => {
    if (!value.trim()) {
      setEmailError(t('staffLogin.errorEmailRequired'));
      return false;
    }
    if (!isValidEmail(value)) {
      setEmailError(t('staffLogin.errorEmailFormat'));
      return false;
    }
    setEmailError('');
    return true;
  };

  /** Validates the password field and sets (or clears) its error. Returns valid flag. */
  const validatePassword = (value) => {
    if (!value) {
      setPasswordError(t('staffLogin.errorPasswordRequired'));
      return false;
    }
    setPasswordError('');
    return true;
  };

  // ── Event handlers ────────────────────────────────────────────────────────

  // On-blur handlers give immediate inline feedback without waiting for submit.
  const handleEmailBlur    = () => validateEmail(email);
  const handlePasswordBlur = () => validatePassword(password);

  /** Form submission: validate → call login() → handle result. */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Clear any previous server-level error
    setAuthError('');

    // Validate both fields — even if one fails, validate the other so the user
    // sees ALL errors at once rather than fixing them one by one.
    const emailOk    = validateEmail(email);
    const passwordOk = validatePassword(password);

    if (!emailOk || !passwordOk) return;

    // ── Attempt sign-in ──
    setSubmitting(true);
    try {
      await login(email, password);
      // On success, AuthContext.onAuthStateChange sets user → the useEffect
      // above fires and redirects to /staff/reports automatically.
    } catch {
      // SECURITY: We catch ALL errors from login() and show the same message.
      // Never reveal whether the email exists — use "Those details didn't match"
      // regardless of the underlying cause (wrong password, unknown email, etc.)
      setAuthError(t('staffLogin.errorInvalid'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page staff-login-page">
      <h1>{t('staffLogin.title')}</h1>

      {/*
        Provisioning note — makes it explicit that self-registration is not
        possible. Staff see this so they know to contact their admin if locked out.
      */}
      <p className="staff-login-note">{t('staffLogin.noSelfRegister')}</p>

      {/* ── Generic auth error banner ───────────────────────────────────── */}
      {authError && (
        <div
          id="auth-error-banner"
          className="login-error"
          role="alert"          // announced immediately by screen readers
          aria-live="assertive"
        >
          {authError}
        </div>
      )}

      {/* ── Login form ─────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} noValidate aria-label={t('staffLogin.title')}>

        {/* ── Email ── */}
        <label htmlFor="staff-email">{t('staffLogin.emailLabel')}</label>
        <input
          id="staff-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleEmailBlur}
          aria-required="true"
          aria-describedby={emailError ? 'email-error' : undefined}
          aria-invalid={!!emailError}
          disabled={submitting}
        />
        {emailError && (
          <p id="email-error" className="field-error" role="alert">
            {emailError}
          </p>
        )}

        {/* ── Password ── */}
        <label htmlFor="staff-password">{t('staffLogin.passwordLabel')}</label>
        <input
          id="staff-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={handlePasswordBlur}
          aria-required="true"
          aria-describedby={passwordError ? 'password-error' : undefined}
          aria-invalid={!!passwordError}
          disabled={submitting}
        />
        {passwordError && (
          <p id="password-error" className="field-error" role="alert">
            {passwordError}
          </p>
        )}

        {/* ── Submit button — minimum 44×44 px via .btn CSS ── */}
        <button
          id="staff-login-submit"
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? t('staffLogin.submitting') : t('staffLogin.submit')}
        </button>
      </form>

      {/* Back link — returns to public home, not to any reporter screen */}
      <Link to="/" className="btn btn-link" style={{ marginTop: '1rem' }}>
        {t('common.back')}
      </Link>
    </div>
  );
}

export default StaffLogin;
