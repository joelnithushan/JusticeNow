/**
 * JusticeNow — Root component: app header + routes.
 *
 * The header bar holds two always-visible safety/UX features:
 *   • LanguageSwitcher — so every page is accessible in the user's language,
 *     even if they land deep in the flow.
 *   • QuickExitButton — safety feature; immediately navigates away from the app.
 *
 * Neither component stores anything to localStorage/sessionStorage.
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import QuickExitButton from './components/QuickExitButton';
import LanguageSwitcher from './components/LanguageSwitcher';
import Home from './pages/Home';
import ReportCase from './pages/ReportCase';
import ReportSuccess from './pages/ReportSuccess';
import CheckStatus from './pages/CheckStatus';
import Directory from './pages/Directory';
import StaffLogin from './pages/StaffLogin';
import StaffReports from './pages/StaffReports';

function App() {
  return (
    <div className="app-container">
      {/*
        App-level header: present on every page.
        - QuickExitButton is fixed-position (top-right) via CSS.
        - LanguageSwitcher sits in the header bar so the user can always
          switch language regardless of which page they are on.
      */}
      <header className="app-header">
        <LanguageSwitcher />
        {/* QuickExitButton is also rendered here for DOM order,
            but visually it is fixed to the top-right corner via CSS */}
        <QuickExitButton />
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/report" element={<ReportCase />} />
          <Route path="/report/success" element={<ReportSuccess />} />
          <Route path="/status" element={<CheckStatus />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/staff/reports" element={<StaffReports />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
