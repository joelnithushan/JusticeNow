/**
 * JusticeNow (web) — Admin Staff list. Route: /staff/admin/staff.
 *
 * Lists ALL staff accounts (active AND inactive, the latter with a badge) so an
 * admin can manage them. Each row navigates to the editor at
 * /staff/admin/staff-member/<id>; the "New" link opens it in create mode
 * (/staff/admin/staff-member/new).
 *
 * PRIVACY: the server's staff projection NEVER includes password_hash, and this
 * page never renders or logs any password material — only the safe display
 * fields (name, email, role, org name, is_active).
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff"). The
 * route is wrapped in <RequireAdmin> (App.jsx) and fetchStaff goes through the
 * token-bearing staffApi against the admin-guarded GET /staff — the SERVER is the
 * real boundary. A 401 means the token expired → log out and bounce to login.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchStaff } from '../api/client';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

function AdminStaff() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const goToLogin = useCallback(() => {
    logout();
    navigate('/staff/login', { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchStaff()
      .then((res) => {
        if (!cancelled) setStaff(res.data.data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          goToLogin();
          return;
        }
        setError(t('adminStaff.networkError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [t, goToLogin]);

  return (
    <div className="page staff-page">
      <div className="admin-header">
        <h1>{t('adminStaff.listTitle')}</h1>
        <Link to="/staff/admin/staff-member/new" className="btn btn-primary btn-inline">
          {t('adminStaff.new')}
        </Link>
      </div>

      {loading && <p>{t('common.loading')}</p>}
      {error && <p className="field-error">{error}</p>}
      {!loading && !error && staff.length === 0 && <p>{t('adminStaff.empty')}</p>}

      {!loading && !error && staff.length > 0 && (
        <table className="reports-table admin-table">
          <thead>
            <tr>
              <th>{t('adminStaff.name')}</th>
              <th>{t('adminStaff.email')}</th>
              <th>{t('adminStaff.role')}</th>
              <th>{t('adminStaff.organisation')}</th>
              <th>{t('adminStaff.active')}</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr
                key={member.id}
                onClick={() => navigate(`/staff/admin/staff-member/${member.id}`)}
              >
                <td>
                  <Link to={`/staff/admin/staff-member/${member.id}`}>
                    {member.name}
                  </Link>
                </td>
                <td>{member.email}</td>
                <td>
                  <span className="status-badge badge-role">
                    {t(`roles.${member.role}`)}
                  </span>
                </td>
                <td>{member.organisation_name || ''}</td>
                <td>
                  <span
                    className={`status-badge ${member.is_active ? 'badge-active' : 'badge-inactive'}`}
                  >
                    {member.is_active ? t('adminStaff.active') : t('adminStaff.inactive')}
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

export default AdminStaff;
