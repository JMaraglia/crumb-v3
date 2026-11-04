// file: src/SettingsPage.jsx
// Settings (the gear on Home): one place for Notifications, Calendar settings and Backup.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaChevronRight } from 'react-icons/fa';
import { IoNotificationsOutline, IoCalendarOutline, IoCloudUploadOutline } from 'react-icons/io5';
import { readLastBackup } from './BackupPage';
import { loadNotifySettings } from './notify';
import './SettingsPage.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const n = loadNotifySettings();
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
      icon: <IoCloudUploadOutline />,
      label: 'Backup & Restore',
      sub: !last ? 'Never backed up' : days === 0 ? 'Last backup: today' : days === 1 ? 'Last backup: yesterday' : `Last backup: ${days} days ago`,
      go: () => navigate('/backup'),
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
                <span className="st-row-sub">{r.sub}</span>
              </span>
              <FaChevronRight className="st-row-chev" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
