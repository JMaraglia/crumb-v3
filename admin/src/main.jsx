import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './admin.css';
import { startAutoUpdate } from './autoUpdate';

createRoot(document.getElementById('root')).render(<App />);
startAutoUpdate();
