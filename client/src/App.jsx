import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ReportHazard from './pages/ReportHazard';
import ReportsFeed from './pages/ReportsFeed';

function App() {
  return (
    <div className="app-container">
      {/* Navigation Header */}
      <Navbar />

      {/* Main View Router */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/report" element={<ReportHazard />} />
          <Route path="/feed" element={<ReportsFeed />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <p><strong>Community Hazard Alert & Response System</strong> — Sri Lanka</p>
          <p style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>
            Academic Project SPM_NU_WE_01 | Team: Joel Nithushan A.T, Vaishnavi L, Thushalini U, Kanistan T
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
