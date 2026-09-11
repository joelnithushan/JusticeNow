/**
 * JusticeNow (web) — Admin Organisations list. Route: /staff/admin/organisations.
 *
 * Lists ALL legal-aid organisations (active AND inactive, the latter with a
 * badge) so an admin can manage them. Each row navigates to the editor at
 * /staff/admin/organisation/<id>; the "New" link opens it in create mode
 * (/staff/admin/organisation/new).
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff"). The
 * route is already wrapped in <RequireAdmin> (App.jsx) and fetchAllOrganisations
 * goes through the token-bearing staffApi against the admin-guarded
 * GET /organisations/all — the SERVER is the real boundary. A 401 means the
 * in-memory token expired → log out and bounce to login (the same leave-no-trace
 * path the other staff screens use).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchAllOrganisations } from '../api/client';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

function AdminOrganisations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // A 401 means the in-memory staff token expired — clear it and return to
  // login so no stale session lingers (leave-no-trace).
  const goToLogin = useCallback(() => {
    logout();
    navigate('/staff/login', { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchAllOrganisations()
      .then((res) => {
        if (!cancelled) setOrgs(res.data.data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          goToLogin();
          return;
        }
        setError(t('adminOrg.networkError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [t, goToLogin]);

  return (
    <div className="page staff-page">
      <div className="admin-header">
        <h1>{t('adminOrg.listTitle')}</h1>
        <Link to="/staff/admin/organisation/new" className="btn btn-primary btn-inline">
          {t('adminOrg.new')}
        </Link>
      </div>

      {loading && <p>{t('common.loading')}</p>}
      {error && <p className="field-error">{error}</p>}
      {!loading && !error && orgs.length === 0 && <p>{t('adminOrg.empty')}</p>}

      {!loading && !error && orgs.length > 0 && (
        <table className="reports-table admin-table">
          <thead>
            <tr>
              <th>{t('adminOrg.name')}</th>
              <th>{t('adminOrg.district')}</th>
              <th>{t('adminOrg.active')}</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr
                key={org.id}
                onClick={() => navigate(`/staff/admin/organisation/${org.id}`)}
              >
                <td>
                  {/* The link keeps the row keyboard-reachable; the row onClick
                      is a mouse convenience on top of it. */}
                  <Link to={`/staff/admin/organisation/${org.id}`}>{org.name}</Link>
                </td>
                <td>{org.district}</td>
                <td>
                  <span
                    className={`status-badge ${org.is_active ? 'badge-active' : 'badge-inactive'}`}
                  >
                    {org.is_active ? t('adminOrg.active') : t('adminOrg.inactive')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminOrganisations;
