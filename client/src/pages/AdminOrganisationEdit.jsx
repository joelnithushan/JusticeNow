/**
 * JusticeNow (web) — Admin Organisation editor (create AND edit).
 * Route: /staff/admin/organisation/:id. A param of 'new' means CREATE; any
 * other value is the id of an org to EDIT.
 *
 * On edit we source the org from fetchAllOrganisations() (the ADMIN list) rather
 * than fetchOrganisation() — the public detail endpoint returns ACTIVE orgs only,
 * so an inactive org would 404 there. The admin list includes inactive orgs and
 * their is_active flag, which the edit form needs.
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff"). The
 * route is wrapped in <RequireAdmin> (App.jsx); every call goes through the
 * token-bearing staffApi against admin-guarded endpoints — the SERVER is the real
 * boundary. A 401 means the in-memory token expired → log out and return to login.
 *
 * VALIDATION: client-side checks (name + district required) give fast feedback,
 * but the SERVER is the authority — it re-validates and returns 400/404. Server
 * 400 messages are surfaced verbatim.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  fetchAllOrganisations,
  createOrganisation,
  updateOrganisation,
  deactivateOrganisation,
} from '../api/client';
import { CASE_TYPES, DISTRICTS } from '../constants';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

function AdminOrganisationEdit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { id } = useParams();

  const isNew = id === 'new';

  // Form state.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [district, setDistrict] = useState('');
  const [caseTypes, setCaseTypes] = useState([]);
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Screen state. A create form needs no initial fetch.
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(''); // notFound | network message
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const goToLogin = useCallback(() => {
    logout();
    navigate('/staff/login', { replace: true });
  }, [logout, navigate]);

  // Load the org to edit from the ADMIN list (works for inactive orgs too).
  useEffect(() => {
    if (isNew) return undefined;

    let cancelled = false;
    setLoading(true);
    setLoadError('');

    fetchAllOrganisations()
      .then((res) => {
        if (cancelled) return;
        const org = res.data.data.find((o) => o.id === id);
        if (!org) {
          setLoadError(t('adminOrg.empty'));
          return;
        }
        setName(org.name);
        setDescription(org.description ?? '');
        setDistrict(org.district);
        setCaseTypes(org.case_types ?? []);
        setContactPhone(org.contact_phone ?? '');
        setContactEmail(org.contact_email ?? '');
        setIsActive(org.is_active);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          goToLogin();
          return;
        }
        setLoadError(t('adminOrg.networkError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id, isNew, t, goToLogin]);

  const toggleCaseType = (value) => {
    setCaseTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation for fast feedback; the server is the authority.
    if (!name.trim()) {
      setFormError(t('adminOrg.nameRequired'));
      return;
    }
    if (!district) {
      setFormError(t('adminOrg.districtRequired'));
      return;
    }
    setFormError('');
    setSaving(true);

    // snake_case body matching the server exactly. Optional text fields send
    // null when blank so the server can clear them.
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      district,
      case_types: caseTypes,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
    };

    try {
      if (isNew) {
        await createOrganisation(payload);
      } else {
        // is_active is editable only on an existing org.
        await updateOrganisation(id, { ...payload, is_active: isActive });
      }
      navigate('/staff/admin/organisations');
    } catch (err) {
      if (err?.response?.status === 401) {
        goToLogin();
        return;
      }
      // Surface the server's validation message when present, else a generic one.
      setFormError(err?.response?.data?.message || t('adminOrg.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    // Confirm before deactivating — it hides the org from the public directory
    // and case assignment. The server soft-deletes (never a hard delete).
    if (!window.confirm(t('adminOrg.deactivateConfirm'))) return;

    setFormError('');
    setSaving(true);
    try {
      await deactivateOrganisation(id);
      navigate('/staff/admin/organisations');
    } catch (err) {
      if (err?.response?.status === 401) {
        goToLogin();
        return;
      }
      setFormError(err?.response?.data?.message || t('adminOrg.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const title = isNew ? t('adminOrg.new') : t('adminOrg.edit');

  return (
    <div className="page staff-page">
      <Link to="/staff/admin/organisations" className="btn-link admin-back">
        {t('common.back')}
      </Link>
      <h1>{title}</h1>

      {loading && <p>{t('common.loading')}</p>}
      {!loading && loadError && <p className="field-error">{loadError}</p>}

      {!loading && !loadError && (
        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <label htmlFor="orgName">{t('adminOrg.name')}</label>
          <input
            id="orgName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />

          {/* Description */}
          <label htmlFor="orgDescription">{t('adminOrg.description')}</label>
          <textarea
            id="orgDescription"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
          />

          {/* District */}
          <label htmlFor="orgDistrict">{t('adminOrg.district')}</label>
          <select
            id="orgDistrict"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            disabled={saving}
          >
            <option value="">{t('report.districtPlaceholder')}</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Case types — multiple checkboxes over CASE_TYPES */}
          <fieldset className="checkbox-fieldset">
            <legend>{t('adminOrg.caseTypes')}</legend>
            <div className="checkbox-group">
              {CASE_TYPES.map((c) => (
                <label key={c} htmlFor={`caseType-${c}`}>
                  <input
                    id={`caseType-${c}`}
                    type="checkbox"
                    checked={caseTypes.includes(c)}
                    onChange={() => toggleCaseType(c)}
                    disabled={saving}
                  />
                  {t(`caseTypes.${c}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Contact phone */}
          <label htmlFor="orgPhone">{t('adminOrg.contactPhone')}</label>
          <input
            id="orgPhone"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            disabled={saving}
          />

          {/* Contact email */}
          <label htmlFor="orgEmail">{t('adminOrg.contactEmail')}</label>
          <input
            id="orgEmail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            disabled={saving}
          />

          {/* Active toggle — edit only */}
          {!isNew && (
            <div className="toggle-row">
              <input
                id="orgActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={saving}
              />
              <label htmlFor="orgActive">{t('adminOrg.active')}</label>
            </div>
          )}

          {formError && <p className="field-error" role="alert">{formError}</p>}

          <div className="admin-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('adminOrg.saving') : t('adminOrg.save')}
            </button>

            {/* Deactivate — edit only */}
            {!isNew && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeactivate}
                disabled={saving}
              >
                {t('adminOrg.deactivate')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export default AdminOrganisationEdit;
