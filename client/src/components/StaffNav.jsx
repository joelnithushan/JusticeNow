/**
 * JusticeNow — Staff header nav strip.
 *
 * Shown ONLY on /staff/* routes and ONLY when a staff session is active, so
 * reporters never see it. Admin-only links (Admin, Audit) are hidden for
 * officer/attorney roles — a UX affordance; the server still enforces access.
 *
 * The right side carries the signed-in staffer's avatar (image, else initials)
 * as a button that jumps to their profile, plus the sign-out control.
 */

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import DefaultAvatar from './DefaultAvatar';

function StaffNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin, logout } = useAuth();
  const { profile } = useProfile();

  const handleSignOut = () => {
    logout();
    navigate('/staff/login', { replace: true });
  };

  return (
    <nav className="staff-nav" aria-label={t('staffNav.label')}>
      <div className="staff-nav-links">
        <NavLink to="/staff/reports">{t('staffNav.reports')}</NavLink>
        <NavLink to="/staff/analytics">{t('staffNav.analytics')}</NavLink>
        <NavLink to="/staff/profile">{t('staffNav.navProfile')}</NavLink>
        {isAdmin && (
          <NavLink to="/staff/admin/organisations">{t('staffNav.admin')}</NavLink>
        )}
        {isAdmin && <NavLink to="/staff/audit">{t('staffNav.audit')}</NavLink>}
      </div>

      <div className="staff-nav-actions">
        {/* Avatar shortcut to the profile page — image if uploaded, else the
            shared default avatar (same look as the profile page). */}
        <button
          type="button"
          className="staff-nav-avatar"
          onClick={() => navigate('/staff/profile')}
          aria-label={t('staffNav.navProfile')}
          title={t('staffNav.navProfile')}
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : (
            <DefaultAvatar size={32} />
          )}
        </button>
        <button type="button" className="btn-link" onClick={handleSignOut}>
          {t('staffNav.signOut')}
        </button>
      </div>
    </nav>
  );
}

export default StaffNav;
