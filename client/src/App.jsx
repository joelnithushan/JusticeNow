/**
 * JusticeNow — Root component: app header + routes.
 *
 * The header bar holds two always-visible safety/UX features:
 *   • LanguageSwitcher — so every page is accessible in the user's language,
 *     even if they land deep in the flow.
 *   • QuickExitButton — safety feature; immediately navigates away from the app.
 *
 * Neither component stores anything to localStorage/sessionStorage.
 *
 * ROUTE STRUCTURE:
 *
 *   Public (reporter) routes — NO auth, NO auth context:
 *     /                   Home
 *     /report             Submit a case report (anonymous)
 *     /report/success     Reference code display
 *     /status             Check case status by reference code
 *     /status/result      Case status result for a looked-up reference code
 *     /directory          Legal resource directory
 *     /exit               Neutral cover screen reached via Quick Exit button
 *
 *   Staff routes:
 *     /staff/login        Login form — public, outside the auth guard
 *     /staff/reports      Case list  — PROTECTED by ProtectedRoute
 *     /staff/reports/:id  Case detail — PROTECTED by ProtectedRoute
 *
 * AuthProvider wraps the entire tree so the session is resolved before
 * ProtectedRoute renders. Reporter components never consume AuthContext.
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import QuickExitButton from './components/QuickExitButton';
import LanguageSwitcher from './components/LanguageSwitcher';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import ReportCase from './pages/ReportCase';
import ReportSuccess from './pages/ReportSuccess';
import CheckStatus from './pages/CheckStatus';
import CaseStatus from './pages/CaseStatus';
import Directory from './pages/Directory';
import OrganisationDetail from './pages/OrganisationDetail';
import StaffLogin from './pages/StaffLogin';
import StaffReports from './pages/StaffReports';
import StaffReportDetail from './pages/StaffReportDetail';
import QuickExitScreen from './pages/QuickExitScreen';

function App() {
  return (
    /*
     * AuthProvider wraps everything so useAuth() is available in ProtectedRoute,
     * StaffHeader, and StaffLogin. Reporter components never call useAuth().
     */
    <AuthProvider>
      <div className="app-container">
        {/*
          App-level header: present on every page.
          - QuickExitButton is fixed-position (bottom-right) via CSS.
          - LanguageSwitcher sits in the header bar so the user can always
            switch language regardless of which page they are on.
        */}
        <header className="app-header">
          <LanguageSwitcher />
        </header>

        {/* Safety feature. Fixed bottom-right (thumb-reachable) via CSS and
            rendered outside the header so it floats over the page. It decides
            for itself which screens to appear on (reporter pages only). */}
        <QuickExitButton />

        <main className="main-content">
          <Routes>
            {/* ── Public / reporter routes ────────────────────────────────── */}
            <Route path="/"               element={<Home />} />
            <Route path="/report"         element={<ReportCase />} />
            <Route path="/report/success" element={<ReportSuccess />} />
            <Route path="/status"         element={<CheckStatus />} />
            <Route path="/status/result"  element={<CaseStatus />} />
            <Route path="/directory"      element={<Directory />} />
            <Route path="/directory/:id"  element={<OrganisationDetail />} />
            {/* Neutral cover screen reached only via the Quick Exit button. */}
            <Route path="/exit"           element={<QuickExitScreen />} />

            {/* ── Staff: login (public — must NOT be inside ProtectedRoute) ── */}
            <Route path="/staff/login"    element={<StaffLogin />} />

            {/*
             * ── Staff: protected routes ────────────────────────────────────
             * ProtectedRoute checks auth state and renders <Outlet /> if the
             * user is authenticated, or redirects to /staff/login if not.
             * Adding a new staff page? Nest it here — it gets the guard for free.
             */}
            <Route element={<ProtectedRoute />}>
              <Route path="/staff/reports"     element={<StaffReports />} />
              <Route path="/staff/reports/:id" element={<StaffReportDetail />} />
            </Route>

            {/* ── Catch-all: fall back to home ─────────────────────────────── */}
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;
