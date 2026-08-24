import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { QuickExitProvider } from './context/QuickExitContext';
import './i18n'; // initialise translations before the first render
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* QuickExitProvider lets the Quick Exit button wipe in-progress case
          data (held in memory only) across the whole app in one tap. */}
      <QuickExitProvider>
        <App />
      </QuickExitProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
