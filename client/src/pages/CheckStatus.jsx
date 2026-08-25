/**
 * JusticeNow — Check case status: code entry page (JNOW-11).
 *
 * Presents one large input so reporters can type their reference code
 * from a handwritten note.  Key design decisions:
 *
 *   - Input is auto-uppercased on every keystroke so the user does not need
 *     to worry about case.  The server also stores codes in uppercase.
 *   - Generous letter-spacing (0.25em) makes each character visually distinct,
 *     reducing mis-reads from handwritten notes.
 *   - The value is held ONLY in React state — never written to
 *     localStorage or sessionStorage (privacy requirement).
 *   - On a 404 the error message says "didn't match", not "no such case",
 *     so it does not confirm whether particular codes exist.
 *   - On success we navigate to /status/result passing the API response via
 *     router state (in memory only, discarded on reload).
 *
 * PRIVACY NOTE: the reference code itself is not an identifier — it cannot
 * be linked back to a person — but we still keep it out of persistent
 * storage as belt-and-suspenders protection.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchCaseStatus } from '../api/client';

function CheckStatus() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // The entered code lives in component state only — never stored.
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  /**
   * Auto-uppercase every character the user types.
   * This is intentional: codes are generated/stored uppercase and
   * reporters often handwrite them in capitals or all-caps.
   */
  const handleChange = (e) => {
    setCode(e.target.value.toUpperCase());
    setError(''); // clear stale error while the user is editing
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Trim whitespace so copy-paste with surrounding spaces still works.
    const trimmed = code.trim();
    if (!trimmed) return;

    setChecking(true);
    setError('');

    try {
      const res = await fetchCaseStatus(trimmed);

      // Navigate to the result page, passing data through router state
      // (in-memory only — discarded if the user reloads the page).
      navigate('/status/result', {
        state: { caseData: res.data.data, referenceCode: trimmed },
      });
    } catch (err) {
      if (err.response?.status === 404) {
        // Non-revealing: we do not say "no case with that code" because that
        // confirms which codes exist.  See JNOW-11 acceptance criteria.
        setError(t('status.errorNotFound'));
      } else {
        setError(t('status.errorNetwork'));
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="page">
      <h1>{t('status.title')}</h1>

      <form onSubmit={handleSubmit} noValidate>
        {/* Label + hint text tell the reporter exactly what to enter */}
        <label htmlFor="referenceCode">{t('status.inputLabel')}</label>
        <p className="privacy-note small">{t('status.inputHint')}</p>

        {/*
          The code input is intentionally large and spaced out:
            - font-size: 1.5rem  → easy to read character by character
            - letter-spacing     → separates characters visually
            - text-transform     → shows uppercase in the input box as the
                                   user types (CSS mirrors the JS toUpperCase)
            - autoComplete off   → prevents browser from suggesting previous
                                   entries — each lookup is independent
        */}
        <input
          id="referenceCode"
          type="text"
          value={code}
          onChange={handleChange}
          placeholder={t('status.inputPlaceholder')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="reference-code-input"
          aria-describedby="ref-code-hint ref-code-error"
          disabled={checking}
          required
        />

        {/* Non-revealing error — shown only after a failed lookup */}
        {error && (
          <p id="ref-code-error" className="field-error" role="alert">
            {error}
          </p>
        )}

        <button
          id="check-status-submit"
          type="submit"
          className="btn btn-primary"
          disabled={checking || !code.trim()}
        >
          {checking ? t('status.checking') : t('status.submit')}
        </button>
      </form>

      <Link to="/" className="btn btn-link" style={{ marginTop: '1rem', display: 'block' }}>
        {t('common.back')}
      </Link>
    </div>
  );
}

export default CheckStatus;
