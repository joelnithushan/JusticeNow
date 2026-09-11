/**
 * JusticeNow — Root component: routes + the always-visible Quick Exit button.
 *
 * Route map: reporter pages are public; every /staff/* route except login is
 * wrapped in a client-side guard (RequireStaff/RequireAdmin). Those guards are
 * UX only — the SERVER is the real authorization boundary.
 */

import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import QuickExitButton from './components/QuickExitButton';
import AppLogo from './components/AppLogo';
import StaffNav from './components/StaffNav';
import { RequireStaff, RequireAdmin, RequireProfile } from './components/RequireStaff';
import { useAuth } from './context/AuthContext';
import Home from './pages/Home';
import ReportCase from './pages/ReportCase';
import ReportSuccess from './pages/ReportSuccess';
import CheckStatus from './pages/CheckStatus';
import Directory from './pages/Directory';
import DirectoryDetail from './pages/DirectoryDetail';
import About from './pages/About';
import StaffLogin from './pages/StaffLogin';
import StaffReports from './pages/StaffReports';
import StaffProfile from './pages/StaffProfile';
import StaffCaseDetail from './pages/StaffCaseDetail';
import StaffAnalytics from './pages/StaffAnalytics';
import StaffAudit from './pages/StaffAudit';
import AdminOrganisations from './pages/AdminOrganisations';
import AdminOrganisationEdit from './pages/AdminOrganisationEdit';
import AdminStaff from './pages/AdminStaff';
import AdminStaffEdit from './pages/AdminStaffEdit';
import NotFound from './pages/NotFound';

function App() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // The staff nav appears only inside the staff area and only for a logged-in
  // staff member — reporters never see it, and neither does the login page
  // (there is no session there yet).
  const isStaffArea =
    location.pathname.startsWith('/staff') && location.pathname !== '/staff/login';
  const showStaffNav = isStaffArea && isAuthenticated;

  return (
    <div className="app-container">
      {/* Safety feature: visible on every page, always in the same place */}
      <QuickExitButton />

      <div className="app-logo-header">
        <AppLogo />
      </div>

      {showStaffNav && <StaffNav />}

      <main className="main-content">
        <Routes>
          {/* Reporter (public, anonymous) routes */}
          <Route path="/" element={<Home />} />
          <Route path="/report" element={<ReportCase />} />
          <Route path="/report/success" element={<ReportSuccess />} />
          <Route path="/status" element={<CheckStatus />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/directory/:id" element={<DirectoryDetail />} />
          <Route path="/about" element={<About />} />

          {/* Staff login stays PUBLIC — it mints the session. */}
          <Route path="/staff/login" element={<StaffLogin />} />

          {/* Staff routes — guarded (client-side UX; server is the real boundary).
              RequireProfile wraps the content so a staffer with an incomplete
              profile is forced to /staff/profile until they finish it. The
              profile page itself is guarded by RequireStaff ONLY (not the gate),
              so it stays reachable — that is where they complete the profile. */}
          <Route
            path="/staff/profile"
            element={
              <RequireStaff>
                <StaffProfile />
              </RequireStaff>
            }
          />
          <Route
            path="/staff/reports"
            element={
              <RequireStaff>
                <RequireProfile>
                  <StaffReports />
                </RequireProfile>
              </RequireStaff>
            }
          />
          <Route
            path="/staff/case/:id"
            element={
              <RequireStaff>
                <RequireProfile>
                  <StaffCaseDetail />
                </RequireProfile>
              </RequireStaff>
            }
          />
          <Route
            path="/staff/analytics"
            element={
              <RequireStaff>
                <RequireProfile>
                  <StaffAnalytics />
                </RequireProfile>
              </RequireStaff>
            }
          />
          {/* Admin-only staff routes */}
          <Route
            path="/staff/audit"
            element={
              <RequireAdmin>
                <RequireProfile>
                  <StaffAudit />
                </RequireProfile>
              </RequireAdmin>
            }
          />
          <Route
            path="/staff/admin/organisations"
            element={
              <RequireAdmin>
                <RequireProfile>
                  <AdminOrganisations />
                </RequireProfile>
              </RequireAdmin>
            }
          />
          <Route
            path="/staff/admin/organisation/:id"
            element={
              <RequireAdmin>
                <RequireProfile>
                  <AdminOrganisationEdit />
                </RequireProfile>
              </RequireAdmin>
            }
          />
          <Route
            path="/staff/admin/staff"
            element={
              <RequireAdmin>
                <RequireProfile>
                  <AdminStaff />
                </RequireProfile>
              </RequireAdmin>
            }
          />
          <Route
            path="/staff/admin/staff-member/:id"
            element={
              <RequireAdmin>
                <RequireProfile>
                  <AdminStaffEdit />
                </RequireProfile>
              </RequireAdmin>
            }
          />

          {/* Unknown routes: honest 404, not a silent redirect home. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
