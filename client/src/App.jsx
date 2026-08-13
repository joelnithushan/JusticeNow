/**
 * JusticeNow — Root component: routes + the always-visible Quick Exit button.
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import QuickExitButton from './components/QuickExitButton';
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
      {/* Safety feature: visible on every page, always in the same place */}
      <QuickExitButton />

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
