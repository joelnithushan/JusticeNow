/**
 * JusticeNow — ProtectedRoute component (STAFF ONLY).
 *
 * PURPOSE:
 *   Acts as an authentication gate for all /staff/* routes except /staff/login.
 *   Uses React Router v6's nested-route pattern: wrap staff routes in a
 *   <Route element={<ProtectedRoute />}> and they render via <Outlet />.
 *
 * BEHAVIOUR:
 *
 *   loading === true
 *     → Render a neutral "Checking session…" message.
 *       This covers the brief moment on page refresh between mount and the
 *       getSession() promise resolving. Without this, the user would see a
 *       flash redirect to /staff/login before the session is confirmed.
 *
 *   user === null (not authenticated)
 *     → <Navigate to="/staff/login" replace />
 *       `replace` is used so the back button doesn't return the user to a
 *       protected page they just got bounced from — better UX.
 *
 *   user exists (authenticated)
 *     → <Outlet /> — render the requested staff route normally.
 *
 * REPORTER SAFETY:
 *   This component is never rendered on any reporter path. It only appears
 *   inside the nested <Route element={<ProtectedRoute />}> block in App.jsx.
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  // ── Phase 1: session not yet resolved ──────────────────────────────────────
  // Show a simple loading indicator. This prevents a redirect flash on refresh.
  if (loading) {
    return (
      <div className="page" aria-live="polite" aria-busy="true">
        <p className="auth-loading">{t('staff.loading')}</p>
      </div>
    );
  }

  // ── Phase 2: no authenticated user ────────────────────────────────────────
  // Redirect to the login page. `replace` keeps browser history clean.
  if (!user) {
    return <Navigate to="/staff/login" replace />;
  }

  // ── Phase 3: authenticated ─────────────────────────────────────────────────
  // Render whatever staff route matched — StaffReports, StaffReportDetail, etc.
  return <Outlet />;
}

export default ProtectedRoute;
