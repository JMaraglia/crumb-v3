import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme.css'; // Light / Midnight named colors (load before every other style)
import App from './App.jsx';
import './App.css';
import { startTheme } from './theme';
import { startAutoUpdate } from './autoUpdate';

startTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

startAutoUpdate(); // reload to the newest version when Crumb comes back to the screen
