// file: src/theme.js
// Light / Midnight appearance (Nov 11, 2026). Light is the default.
// The choice is saved with your other settings (crumb_app_settings.theme), which sync to every device.
// index.html sets it before Crumb draws (no white flash); this keeps it right after changes and syncs.
import { loadAppSettings } from './store';

export const THEMES = ['light', 'midnight'];
const BAR = { light: '#f4f6f8', midnight: '#06101c' }; // phone top-bar color

export function currentTheme() {
  const t = loadAppSettings().theme;
  return THEMES.includes(t) ? t : 'light';
}

export function applyTheme(t = currentTheme()) {
  const root = document.documentElement;
  if (t === 'midnight') root.setAttribute('data-theme', 'midnight');
  else root.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BAR[t] || BAR.light);
}

export function startTheme() {
  applyTheme();
  // A change made on another device arrives with the settings: re-apply it.
  window.addEventListener('crumb-pulled', () => applyTheme());
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key === 'crumb_app_settings') applyTheme();
  });
}
