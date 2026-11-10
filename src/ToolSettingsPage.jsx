// file: src/ToolSettingsPage.jsx
// Settings → one tool's own page (Nov 10, 2026): Calendar, Daily Stops, Call Sheet, To-Do.
// Each has a Show switch (off = hidden everywhere, nothing deleted) and room for more settings later.
// Uses the Settings page's look (st- classes).
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaChevronRight } from 'react-icons/fa';
import { loadAppSettings, saveAppSettings, loadCallSheetSettings, saveCallSheetSettings } from './store';
import { useCloudRefresh } from './useCloudRefresh';
import './SettingsPage.css';

const TOOLS = {
  calendar: {
    title: 'Calendar',
    switches: [{ store: 'app', k: 'calendar', label: 'Show Calendar', sub: 'The Calendar tile on Home' }],
    more: { label: 'Calendar Settings', sub: 'Week view, event length, start time, what shows, colors' },
  },
  'daily-stops': {
    title: 'Daily Stops',
    switches: [{ store: 'app', k: 'dailyStops', label: 'Show Daily Stops', sub: 'The Daily Stops tile on Home, the Daily Stops button on lists, and stop reminders' }],
  },
  'call-sheet': {
    title: 'Call Sheet',
    switches: [
      { store: 'cs', k: 'show', label: 'Show Call Sheet', sub: 'The Call Sheet tile on Home' },
      { store: 'cs', k: 'online', label: 'Online Ordering', sub: 'Shows who orders online (set on each customer)', needs: 'show' },
      { store: 'cs', k: 'orders', label: 'Track Orders', sub: 'Ordered / Did Not Order on each row', needs: 'show' },
    ],
  },
  todo: {
    title: 'To-Do',
    switches: [{ store: 'app', k: 'todo', label: 'Show To-Do', sub: 'The To-Do tile on Home and to-do reminders' }],
  },
};

export default function ToolSettingsPage() {
  const navigate = useNavigate();
  const { tool } = useParams();
  const t = TOOLS[tool];
  const [app, setApp] = useState(loadAppSettings);
  const [cs, setCs] = useState(loadCallSheetSettings);
  useCloudRefresh(() => {
    // changes from your other device, re-read in place
    setApp(loadAppSettings());
    setCs(loadCallSheetSettings());
  });
  useEffect(() => {
    if (!t) navigate('/settings', { replace: true }); // unknown page: back to Settings
  }, [t, navigate]);
  if (!t) return null;
  const value = (s) => (s.store === 'cs' ? cs[s.k] : app[s.k]);
  const set = (s, on) => {
    if (s.store === 'cs') {
      const next = { ...cs, [s.k]: on };
      setCs(next);
      saveCallSheetSettings(next);
    } else {
      setApp({ ...app, [s.k]: on });
      saveAppSettings({ [s.k]: on });
    }
  };
  const shown = t.switches.filter((s) => !s.needs || value({ ...s, k: s.needs }));
  const openCalendarSettings = () => {
    try {
      sessionStorage.setItem('crumb_open_cal_settings', '1'); // Calendar opens its settings right away
    } catch {
      /* not critical */
    }
    navigate('/calendar');
  };

  return (
    <div className="st-page">
      <header className="st-header">
        <button className="st-icon-btn" onClick={() => navigate('/settings')} aria-label="Back">
          <FaArrowLeft />
        </button>
      </header>
      <div className="st-content">
        <h1 className="st-title">{t.title}</h1>
        <div className="st-group">
          {shown.map((s) => (
            <label key={s.k} className="st-row st-switch-row">
              <span className="st-row-text">
                <span className="st-row-label">{s.label}</span>
                <span className="st-row-sub">{s.sub}</span>
              </span>
              <input type="checkbox" className="st-switch" checked={value(s)} onChange={(e) => set(s, e.target.checked)} aria-label={s.label} />
            </label>
          ))}
        </div>
        {t.more && (
          <div className="st-group st-group-top">
            <button className="st-row" onClick={openCalendarSettings}>
              <span className="st-row-text">
                <span className="st-row-label">{t.more.label}</span>
                <span className="st-row-sub">{t.more.sub}</span>
              </span>
              <FaChevronRight className="st-row-chev" />
            </button>
          </div>
        )}
        <p className="st-note">Turning something off only hides it. Nothing is deleted, and turning it back on brings it all back.</p>
      </div>
    </div>
  );
}
