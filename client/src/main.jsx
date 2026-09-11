import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import './i18n'; // initialise translations before the first render
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* Staff auth lives in memory only (see AuthContext) — never persisted. */}
      <AuthProvider>
        {/* Profile is fetched on login and kept in memory only; it must sit
            INSIDE AuthProvider so it can read the auth state. */}
        <ProfileProvider>
          <App />
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
