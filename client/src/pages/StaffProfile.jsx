/**
 * JusticeNow (web) — Self-service staff profile.
 *
 * The signed-in staffer edits their OWN record (GET/PATCH /staff/me). Reached
 * only through RequireStaff (App.jsx). All API calls use the token-bearing
 * staffApi and are scoped server-side to req.staff.id — there is no way to
 * touch anyone else's row from here.
 *
 * SERVER IS THE AUTHORITY: the NIC + mobile are validated on the server, which
 * also DERIVES gender + date_of_birth from the NIC. We show the server's 400
 * message inline and never guess gender/dob client-side. gender + date_of_birth
 * are therefore READ-ONLY here (they appear only after a successful save).
 *
 * PRIVACY: a profile carries a real person's NIC / phone — we never log the
 * response or the error, and (like the rest of the staff area) nothing is
 * persisted to the device.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { updateMe, uploadAvatar, changeMyPassword } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import './StaffProfile.css';

// Two-letter initials for the fallback avatar when there is no image yet.
function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Pull the server's 400 message out of an axios error, else a fallback. The
// server returns a single clear NIC/mobile message we surface verbatim.
function serverMessage(err, fallback) {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return fallback;
}

function StaffProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { profile, loading, error, refresh } = useProfile();

  // Editable field state, seeded from the loaded profile.
  const [name, setName] = useState('');
  const [nic, setNic] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [barNumber, setBarNumber] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');

  // Password change state (only used for password accounts).
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  // Seed the form when the profile arrives / changes (e.g. after a refresh).
  useEffect(() => {
    if (!profile) return;
    setName(profile.name || '');
    setNic(profile.nic || '');
    setPhone(profile.phone || '');
    setDesignation(profile.designation || '');
    setBarNumber(profile.bar_number || '');
  }, [profile]);

  const isAttorney = profile?.role === 'attorney';
  const isPasswordAccount = profile?.auth_method === 'password';

  // A dead in-memory token surfaces as a 401 — drop the session and re-login,
  // mirroring StaffReports.
  const handle401 = (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      logout();
      navigate('/staff/login', { replace: true });
      return true;
    }
    return false;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setSaveError('');
    setSavedMessage('');

    try {
      await updateMe({
        name,
        nic,
        phone,
        designation,
        // bar_number is only meaningful for attorneys; the server ignores it
        // for other roles, but we only send it when it applies.
        ...(isAttorney ? { barNumber } : {}),
      });
      // Re-pull so the derived gender + date_of_birth (and completion flag)
      // reflect the just-saved NIC.
      await refresh();
      setSavedMessage(t('profile.saved'));
    } catch (err) {
      if (handle401(err)) return;
      // Show the server's field message (e.g. invalid NIC) verbatim; fall back
      // to a generic save error. Never log err (carries NIC / phone).
      setSaveError(serverMessage(err, t('profile.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    // Reset the input so choosing the same file twice still fires onChange.
    e.target.value = '';
    if (!file || photoBusy) return;

    setPhotoBusy(true);
    setPhotoError('');
    try {
      await uploadAvatar(file);
      await refresh();
    } catch (err) {
      if (handle401(err)) return;
      setPhotoError(serverMessage(err, t('profile.photoFailed')));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (passwordBusy) return;

    setPasswordBusy(true);
    setPasswordError('');
    setPasswordMessage('');
    try {
      await changeMyPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage(t('profile.passwordChanged'));
    } catch (err) {
      if (handle401(err)) return;
      setPasswordError(serverMessage(err, t('profile.passwordFailed')));
    } finally {
      setPasswordBusy(false);
    }
  };

  // First load, before the profile arrives.
  if (loading && !profile) {
    return (
      <div className="page staff-page">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  // Loaded but failed (and nothing to show) — offer a retry rather than a blank.
  if (!profile) {
    return (
      <div className="page staff-page">
        <h1>{t('profile.title')}</h1>
        <p className="field-error" role="alert">{t('profile.loadFailed')}</p>
        <button type="button" className="btn btn-secondary" onClick={() => refresh().catch(() => {})}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const genderLabel =
    profile.gender === 'male'
      ? t('profile.male')
      : profile.gender === 'female'
        ? t('profile.female')
        : '';

  return (
    <div className="page staff-page staff-profile">
      <h1>{t('profile.title')}</h1>
      <p className="tagline">{t('profile.subtitle')}</p>

      {/* Force the incomplete-profile prompt when the gate sent them here. */}
      {profile.profile_completed === false && (
        <p className="privacy-note" role="status">{t('profile.completePrompt')}</p>
      )}

      {/* Avatar + change-photo control */}
      <div className="profile-avatar-row">
        {profile.avatar_url ? (
          <img className="profile-avatar" src={profile.avatar_url} alt="" />
        ) : (
          <span className="profile-avatar profile-avatar-initials" aria-hidden="true">
            {initialsOf(profile.name)}
          </span>
        )}
        <label className="btn btn-secondary profile-photo-btn">
          {photoBusy ? t('profile.saving') : t('profile.changePhoto')}
          <input
            type="file"
            accept="image/*"
            className="visually-hidden-input"
            disabled={photoBusy}
            onChange={handlePhoto}
          />
        </label>
      </div>
      {photoError && <p className="field-error" role="alert">{photoError}</p>}

      {/* Editable details */}
      <form onSubmit={handleSave} noValidate>
        <label htmlFor="profileName">{t('profile.name')}</label>
        <input
          id="profileName"
          type="text"
          value={name}
          disabled={saving}
          onChange={(e) => setName(e.target.value)}
        />

        <label htmlFor="profileNic">{t('profile.nic')}</label>
        <input
          id="profileNic"
          type="text"
          value={nic}
          autoCapitalize="characters"
          autoCorrect="off"
          disabled={saving}
          onChange={(e) => setNic(e.target.value)}
        />

        {/* Derived read-only fields — shown once the NIC has been decoded. */}
        {(genderLabel || profile.date_of_birth) && (
          <div className="profile-derived">
            {genderLabel && (
              <p>
                <span className="profile-derived-label">{t('profile.gender')}:</span> {genderLabel}
              </p>
            )}
            {profile.date_of_birth && (
              <p>
                <span className="profile-derived-label">{t('profile.dateOfBirth')}:</span>{' '}
                {profile.date_of_birth}
              </p>
            )}
          </div>
        )}

        <label htmlFor="profilePhone">{t('profile.phone')}</label>
        <input
          id="profilePhone"
          type="tel"
          value={phone}
          disabled={saving}
          onChange={(e) => setPhone(e.target.value)}
        />

        <label htmlFor="profileDesignation">{t('profile.designation')}</label>
        <input
          id="profileDesignation"
          type="text"
          value={designation}
          disabled={saving}
          onChange={(e) => setDesignation(e.target.value)}
        />

        {/* Bar number is required only for attorneys. */}
        {isAttorney && (
          <>
            <label htmlFor="profileBarNumber">{t('profile.barNumber')}</label>
            <input
              id="profileBarNumber"
              type="text"
              value={barNumber}
              disabled={saving}
              onChange={(e) => setBarNumber(e.target.value)}
            />
          </>
        )}

        {saveError && <p className="field-error" role="alert">{saveError}</p>}
        {savedMessage && <p className="profile-success" role="status">{savedMessage}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('profile.saving') : t('profile.save')}
        </button>
      </form>

      {/* Read-only account facts (admins control these) */}
      <dl className="profile-readonly">
        <dt>{t('profile.email')}</dt>
        <dd>{profile.email}</dd>
        <dt>{t('profile.role')}</dt>
        <dd>{t(`roles.${profile.role}`)}</dd>
        <dt>{t('profile.organisation')}</dt>
        <dd>{profile.organisation_name || '—'}</dd>
      </dl>

      {/* Change password — password accounts only; Google shows a note. */}
      <section className="profile-password">
        <h2>{t('profile.changePassword')}</h2>
        {isPasswordAccount ? (
          <form onSubmit={handlePassword} noValidate>
            <label htmlFor="currentPassword">{t('profile.currentPassword')}</label>
            <div className="password-field">
              <input
                id="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                autoComplete="current-password"
                disabled={passwordBusy}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? t('staffLogin.hidePassword') : t('staffLogin.showPassword')}
                title={showCurrent ? t('staffLogin.hidePassword') : t('staffLogin.showPassword')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  {showCurrent && <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
                </svg>
              </button>
            </div>

            <label htmlFor="newPassword">{t('profile.newPassword')}</label>
            <div className="password-field">
              <input
                id="newPassword"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                autoComplete="new-password"
                disabled={passwordBusy}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? t('staffLogin.hidePassword') : t('staffLogin.showPassword')}
                title={showNew ? t('staffLogin.hidePassword') : t('staffLogin.showPassword')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  {showNew && <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
                </svg>
              </button>
            </div>

            {passwordError && <p className="field-error" role="alert">{passwordError}</p>}
            {passwordMessage && <p className="profile-success" role="status">{passwordMessage}</p>}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={passwordBusy || !currentPassword || !newPassword}
            >
              {passwordBusy ? t('profile.saving') : t('profile.changePassword')}
            </button>
          </form>
        ) : (
          <p className="tagline">{t('profile.googlePasswordNote')}</p>
        )}
      </section>
    </div>
  );
}

export default StaffProfile;
