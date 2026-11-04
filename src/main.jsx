import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './App.css';
import { startAutoUpdate } from './autoUpdate';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

startAutoUpdate(); // reload to the newest version when Crumb comes back to the screen
