// file: src/SettingsPage.jsx
// Settings (the gear on Home): one place for Notifications, Calendar settings and Backup.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaChevronRight } from 'react-icons/fa';
import { IoNotificationsOutline, IoCalendarOutline, IoCloudUploadOutline, IoTimeOutline } from 'react-icons/io5';
import { readLastBackup } from './BackupPage';
import { loadNotifySettings, syncReminders } from './notify';
import { staleDays, STALE_KEY } from './lastContact';
import AskSheet from './AskSheet';
import './SettingsPage.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const n = loadNotifySettings();
  const [stale, setStale] = useState(staleDays);
  const [pickStale, setPickStale] = useState(false);
  const setStaleDays = (v) => {
    try {
      localStorage.setItem(STALE_KEY, String(v));
    } catch {
      /* not critical */
    }
    setStale(v);
    setPickStale(false);
    syncReminders(true).catch(() => {}); // morning summary count follows the new limit
  };
  const last = Date.parse(readLastBackup());
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const rows = [
    {
      icon: <IoNotificationsOutline />,
      label: 'Notifications',
      sub: n.enabled
        ? 'Morning summary, end-of-day reminder (to-dos and Itinerary), heads-ups before visits'
        : 'Off · tap to turn on reminders',
      go: () => navigate('/notifications'),
    },
    {
      icon: <IoCalendarOutline />,
      label: 'Calendar',
      sub: 'Week view, event length, start time, what shows, colors',
      go: () => {
        try {
          sessionStorage.setItem('crumb_open_cal_settings', '1'); // Calendar opens its settings right away
        } catch {
          /* not critical */
        }
        navigate('/calendar');
      },
    },
    {
      icon: <IoTimeOutline />,
      label: "Haven't seen in a while",
      sub: stale ? `Accounts with no contact in ${stale}+ days (Itinerary, lists, morning summary)` : 'Off',
      go: () => setPickStale(true),
    },
    {
      icon: <IoCloudUploadOutline />,
      label: 'Backup & Restore',
      sub: !last ? 'Never backed up' : days === 0 ? 'Last backup: today' : days === 1 ? 'Last backup: yesterday' : `Last backup: ${days} days ago`,
      go: () => navigate('/backup'),
      due: !last || days >= 7,
    },
  ];
  return (
    <div className="st-page">
      <header className="st-header">
        <button className="st-icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <FaArrowLeft />
        </button>
      </header>
      <div className="st-content">
        <h1 className="st-title">Settings</h1>
        <div className="st-group">
          {rows.map((r) => (
            <button key={r.label} className="st-row" onClick={r.go}>
              <span className="st-row-icon">{r.icon}</span>
              <span className="st-row-text">
                <span className="st-row-label">{r.label}</span>
                <span className={`st-row-sub ${r.due ? 'is-due' : ''}`}>{r.due ? `${r.sub} · time to back up` : r.sub}</span>
              </span>
              <FaChevronRight className="st-row-chev" />
            </button>
          ))}
        </div>
      </div>
      {pickStale && (
        <AskSheet
          title="Haven't seen in a while"
          message="Flag accounts with no visit, note or appointment for:"
          choices={[21, 30, 45, 60, 90].map((d) => ({ label: `${d} days${d === stale ? ' ✓' : ''}`, value: d })).concat([{ label: `Off${!stale ? ' ✓' : ''}`, value: 0 }])}
          onPick={setStaleDays}
          onCancel={() => setPickStale(false)}
        />
      )}
    </div>
  );
}
