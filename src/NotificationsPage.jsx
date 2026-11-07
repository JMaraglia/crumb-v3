// file: src/NotificationsPage.jsx
// Turn push notifications on/off and choose what Crumb reminds you about.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import {
  loadNotifySettings,
  saveNotifySettings,
  enableNotifications,
  disableNotifications,
  sendTestNotification,
  syncReminders,
  buildReminders,
  pushSupport,
  DEFAULT_NOTIFY,
  END_OF_DAY_KINDS,
} from './notify';
import './NotificationsPage.css';
import { useCloudRefresh } from './useCloudRefresh';

const MORNING_TIMES = Array.from({ length: 13 }, (_, i) => 300 + i * 30); // 5:00 – 11:00 AM
const AFTERNOON_TIMES = Array.from({ length: 17 }, (_, i) => 720 + i * 30); // 12:00 – 8:00 PM
const LEADS = [
  [0, 'Off'],
  [10, '10 min before'],
  [15, '15 min before'],
  [30, '30 min before'],
  [45, '45 min before'],
  [60, '1 hr before'],
];
const timeText = (m) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(loadNotifySettings);
  useCloudRefresh(() => setSettings(loadNotifySettings())); // changes from your other device, re-read in place
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const support = pushSupport();
  const on = settings.enabled && support.permission === 'granted';
  const upcoming = on ? buildReminders(settings) : [];

  const change = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveNotifySettings(next);
    setMessage('');
    if (next.enabled) syncReminders(true);
  };

  const turnOn = async () => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const next = await enableNotifications();
      setSettings(next);
      setMessage('Notifications are on. Tap "Send a test" to check.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setSettings(await disableNotifications());
    setBusy(false);
    setMessage('Notifications are off.');
  };

  const test = async () => {
    setError('');
    setMessage('');
    try {
      await sendTestNotification();
      setMessage('Test sent. It should pop up in a few seconds.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="nt-page">
      <header className="nt-header">
        <button className="nt-icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <FaArrowLeft />
        </button>
        <span />
        <span />
      </header>

      <div className="nt-content">
        <h1 className="nt-title">Notifications</h1>

        <div className="nt-card">
          <div className={`nt-status ${on ? 'is-on' : ''}`}>{on ? 'On for this phone' : 'Off'}</div>
          <div className="nt-text">
            {on
              ? `${upcoming.length} reminder${upcoming.length === 1 ? '' : 's'} lined up for the next 7 days.`
              : 'Get a morning summary and a heads-up before visits and appointments, even when Crumb is closed.'}
          </div>
          {!on ? (
            <button className="nt-btn" disabled={busy} onClick={turnOn}>
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </button>
          ) : (
            <div className="nt-btn-row">
              <button className="nt-btn nt-btn-plain" onClick={test}>
                Send a test
              </button>
              <button className="nt-btn nt-btn-plain nt-danger" disabled={busy} onClick={turnOff}>
                Turn off
              </button>
            </div>
          )}
          {!support.standalone && !on && (
            <div className="nt-hint">On iPhone this only works when Crumb is opened from its Home Screen icon.</div>
          )}
        </div>
        {message && <div className="nt-message">{message}</div>}
        {error && <div className="nt-error">{error}</div>}

        <div className="nt-section">What to send</div>
        <div className="nt-group">
          <label className="nt-row">
            <span>
              Morning summary
              <span className="nt-help">Stops for the day and to-dos that are due</span>
            </span>
            <input type="checkbox" className="nt-switch" checked={settings.morning} onChange={(e) => change({ morning: e.target.checked })} />
          </label>
          {settings.morning && (
            <label className="nt-row">
              <span>Send it at</span>
              <select className="nt-select" value={settings.morningTime} onChange={(e) => change({ morningTime: Number(e.target.value) })}>
                {MORNING_TIMES.map((m) => (
                  <option key={m} value={m}>{timeText(m)}</option>
                ))}
              </select>
            </label>
          )}
          <label className="nt-row">
            <span>
              End-of-day reminder
              <span className="nt-help">What's still open from today (and overdue), in the kinds you pick</span>
            </span>
            <input type="checkbox" className="nt-switch" checked={settings.afternoon} onChange={(e) => change({ afternoon: e.target.checked })} />
          </label>
          {settings.afternoon && (
            <label className="nt-row">
              <span>Send it at</span>
              <select className="nt-select" value={settings.afternoonTime} onChange={(e) => change({ afternoonTime: Number(e.target.value) })}>
                {AFTERNOON_TIMES.map((m) => (
                  <option key={m} value={m}>{timeText(m)}</option>
                ))}
              </select>
            </label>
          )}
          {settings.afternoon &&
            END_OF_DAY_KINDS.map(([k, label]) => {
              const kinds = { ...DEFAULT_NOTIFY.afternoonInclude, ...(settings.afternoonInclude || {}) };
              return (
                <label key={k} className="nt-row nt-sub-row">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    className="nt-switch"
                    checked={Boolean(kinds[k])}
                    onChange={(e) => change({ afternoonInclude: { ...kinds, [k]: e.target.checked } })}
                  />
                </label>
              );
            })}
          <label className="nt-row">
            <span>
              Reminders Before
            </span>
            <select className="nt-select" value={settings.lead} onChange={(e) => change({ lead: Number(e.target.value) })}>
              {LEADS.map(([m, l]) => (
                <option key={m} value={m}>{l}</option>
              ))}
            </select>
          </label>
          {settings.lead > 0 &&
            [
              ['appointments', 'Calendar Appointments'],
              ['stops', 'Itinerary Stops'],
            ].map(([k, label]) => {
              const inc = { ...DEFAULT_NOTIFY.leadInclude, ...(settings.leadInclude || {}) };
              return (
                <label key={k} className="nt-row nt-sub-row">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    className="nt-switch"
                    checked={Boolean(inc[k])}
                    onChange={(e) => change({ leadInclude: { ...inc, [k]: e.target.checked } })}
                  />
                </label>
              );
            })}
        </div>

        {on && upcoming.length > 0 && (
          <>
            <div className="nt-section">Coming up</div>
            <div className="nt-group">
              {upcoming.slice(0, 6).map((n) => (
                <div key={n.id} className="nt-item">
                  <div className="nt-item-when">
                    {new Date(n.at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div className="nt-item-title">{n.title}</div>
                  {n.body && <div className="nt-item-body">{n.body}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="nt-foot">
          Only your reminder list (times, account names, and what's due) goes to Crumb's notification server. Your customer
          list and notes stay on this phone.
        </div>
      </div>
    </div>
  );
}
