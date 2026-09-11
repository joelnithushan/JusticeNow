/**
 * JusticeNow (web) — Admin Staff editor (create AND edit).
 * Route: /staff/admin/staff-member/:id. A param of 'new' means CREATE; any
 * other value is the id of a staff account to EDIT.
 *
 * On edit we source the account from fetchStaff() (the ADMIN list, which
 * includes inactive accounts and their is_active flag). There is no public
 * per-staff endpoint — staff accounts are admin-only. The org dropdown is filled
 * from fetchOrganisations() (ACTIVE orgs) — you should not be able to place a new
 * account under a deactivated org.
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff"). The
 * route is wrapped in <RequireAdmin> (App.jsx); every call goes through the
 * token-bearing staffApi against admin-guarded endpoints — the SERVER is the real
 * boundary. A 401 means the token expired → log out and return to login.
 *
 * VALIDATION: client-side checks give fast feedback, but the SERVER is the
 * authority — it re-validates, bcrypt-hashes the password, and returns 400/404.
 *
 * SECURITY: the password field is write-only PLAINTEXT sent to the server, which
 * hashes it. We NEVER render, store, or log a password_hash (the server never
 * sends one), and never log the plaintext password. On CREATE a password is
 * required; on EDIT a blank field means "leave the password unchanged".
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  fetchStaff,
  fetchOrganisations,
  createStaff,
  updateStaff,
  deactivateStaff,
} from '../api/client';
import { STAFF_ROLES } from '../constants';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

function AdminStaffEdit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { id } = useParams();

  const isNew = id === 'new';

  // Form state. `password` is only ever the PLAINTEXT to send; never a hash.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [organisationId, setOrganisationId] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Active orgs for the org dropdown.
  const [orgs, setOrgs] = useState([]);

  // Screen state. Both create + edit need the org list, so both fetch on mount.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const goToLogin = useCallback(() => {
    logout();
    navigate('/staff/login', { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');

    // The org dropdown needs the active org list in both create and edit.
    // On edit we also source the account from the admin staff list (covers
    // inactive accounts too).
    const load = async () => {
      const orgRes = await fetchOrganisations();
      if (cancelled) return;
      setOrgs(orgRes.data.data);

      if (!isNew) {
        const staffRes = await fetchStaff();
        if (cancelled) return;
        const member = staffRes.data.data.find((s) => s.id === id);
        if (!member) {
          setLoadError(t('adminStaff.empty'));
          return;
        }
        setName(member.name);
        setEmail(member.email);
        setRole(member.role);
        setOrganisationId(member.organisation_id ?? '');
        setIsActive(member.is_active);
        // password intentionally left blank — a blank field means "unchanged".
      }
    };

    load()
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          goToLogin();
          return;
        }
        setLoadError(t('adminStaff.networkError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id, isNew, t, goToLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation for fast feedback; the server is the authority.
    if (!name.trim()) {
      setFormError(t('adminStaff.nameRequired'));
      return;
    }
    if (!email.trim()) {
      setFormError(t('adminStaff.emailRequired'));
      return;
    }
    if (!role) {
      setFormError(t('adminStaff.roleRequired'));
      return;
    }
    if (!organisationId) {
      setFormError(t('adminStaff.organisationRequired'));
      return;
    }
    // On CREATE the password is required; on EDIT a blank field means unchanged.
    if (isNew && !password) {
      setFormError(t('adminStaff.passwordRequired'));
      return;
    }
    setFormError('');
    setSaving(true);

    // snake_case body matching the server exactly.
    const payload = {
      name: name.trim(),
      email: email.trim(),
      role,
      organisation_id: organisationId,
    };
    // Only send a password when one was typed (create: always; edit: to change).
    if (password) {
      payload.password = password;
    }

    try {
      if (isNew) {
        await createStaff(payload);
      } else {
        // is_active is editable only on an existing account.
        await updateStaff(id, { ...payload, is_active: isActive });
      }
      navigate('/staff/admin/staff');
    } catch (err) {
      if (err?.response?.status === 401) {
        goToLogin();
        return;
      }
      // Surface the server's validation message (e.g. duplicate email) when
      // present, else a generic one. Never log the payload (it holds a password).
      setFormError(err?.response?.data?.message || t('adminStaff.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    // Confirm before deactivating — it blocks the account's login. The server
    // soft-deletes (never a hard delete) and refuses self / last-admin, returning
    // a specific 400 message we surface below.
    if (!window.confirm(t('adminStaff.deactivateConfirm'))) return;

    setFormError('');
    setSaving(true);
    try {
      await deactivateStaff(id);
      navigate('/staff/admin/staff');
    } catch (err) {
      if (err?.response?.status === 401) {
        goToLogin();
        return;
      }
      setFormError(err?.response?.data?.message || t('adminStaff.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const title = isNew ? t('adminStaff.new') : t('adminStaff.edit');

  return (
    <div className="page staff-page">
      <Link to="/staff/admin/staff" className="btn-link admin-back">
        {t('common.back')}
      </Link>
      <h1>{title}</h1>

      {loading && <p>{t('common.loading')}</p>}
      {!loading && loadError && <p className="field-error">{loadError}</p>}

      {!loading && !loadError && (
        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <label htmlFor="staffName">{t('adminStaff.name')}</label>
          <input
            id="staffName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />

          {/* Email */}
          <label htmlFor="staffEmail">{t('adminStaff.email')}</label>
          <input
            id="staffEmail"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving}
          />

          {/* Role */}
          <label htmlFor="staffRole">{t('adminStaff.role')}</label>
          <select
            id="staffRole"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={saving}
          >
            <option value="">{t('adminStaff.role')}</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{t(`roles.${r}`)}</option>
            ))}
          </select>

          {/* Organisation */}
          <label htmlFor="staffOrg">{t('adminStaff.organisation')}</label>
          <select
            id="staffOrg"
            value={organisationId}
            onChange={(e) => setOrganisationId(e.target.value)}
            disabled={saving}
          >
            <option value="">{t('adminStaff.organisation')}</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          {/* Password. Create: required. Edit: optional "set new password". */}
          <label htmlFor="staffPassword">
            {isNew ? t('adminStaff.password') : t('adminStaff.newPassword')}
          </label>
          <input
            id="staffPassword"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
          />
          <p className="field-hint">
            {isNew ? t('adminStaff.passwordHint') : t('adminStaff.newPasswordHint')}
          </p>

          {/* Active toggle — edit only */}
          {!isNew && (
            <div className="toggle-row">
              <input
                id="staffActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={saving}
              />
              <label htmlFor="staffActive">{t('adminStaff.active')}</label>
            </div>
          )}

          {formError && <p className="field-error" role="alert">{formError}</p>}

          <div className="admin-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('adminStaff.saving') : t('adminStaff.save')}
            </button>

            {/* Deactivate — edit only */}
            {!isNew && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeactivate}
                disabled={saving}
              >
                {t('adminStaff.deactivate')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export default AdminStaffEdit;
