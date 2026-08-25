/**
 * JusticeNow — Staff header with logout control (STAFF ONLY).
 *
 * Rendered at the top of all authenticated staff pages (StaffReports,
 * StaffReportDetail). It is NOT part of the global App shell — reporter pages
 * must never see it.
 *
 * Shows:
 *   - The authenticated user's email address (so staff know who they're logged in as).
 *   - A Log out button that calls logout() from AuthContext.
 *
 * ACCESSIBILITY:
 *   - <header> landmark so screen readers can jump to it.
 *   - Logout button meets the 44×44 px minimum touch target via .btn-logout CSS.
 *   - Visible focus ring via :focus-visible in index.css.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

function StaffHeader() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <header className="staff-header" role="banner">
      {/* Display the signed-in email so staff can confirm their identity */}
      <span className="staff-header__email">
        {t('staff.loggedInAs', { email: user?.email ?? '' })}
      </span>

      {/* Logout — calls AuthContext.logout() which signs out and navigates home */}
      <button
        id="staff-logout-btn"
        type="button"
        className="btn-logout"
        onClick={logout}
      >
        {t('staff.logout')}
      </button>
    </header>
  );
}

export default StaffHeader;
