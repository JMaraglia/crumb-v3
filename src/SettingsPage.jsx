// file: src/SettingsPage.jsx
// Settings (the gear on Home): one place for Notifications, Calendar settings and Backup.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaChevronRight } from 'react-icons/fa';
import { IoNotificationsOutline, IoCalendarOutline, IoCloudUploadOutline, IoTimeOutline, IoCloudOutline, IoPersonCircleOutline, IoBugOutline, IoBulbOutline, IoLocationOutline, IoCallOutline, IoCheckboxOutline } from 'react-icons/io5';
import { readLastBackup } from './BackupPage';
import { loadNotifySettings, syncReminders } from './notify';
import { staleDays, STALE_KEY } from './lastContact';
import AskSheet from './AskSheet';
import { writeText, loadCallSheetSettings, loadAppSettings } from './store';
import './SettingsPage.css';
import { useCloudRefresh } from './useCloudRefresh';
import { syncBlockReason, isTestProject, isRealSynced, projectRef } from './syncMode';
import { APP_VERSION } from './version';

// Who's signed in on this device (read from where the sign-in is remembered; no cloud library needed).
function signedInEmail() {
  try {
    const v = JSON.parse(localStorage.getItem(`sb-${projectRef()}-auth-token`) || 'null');
    return (v && v.user && v.user.email) || '';
  } catch {
    return '';
  }
}

// One line under "Cloud": is this device syncing?
function syncLine() {
  const why = syncBlockReason();
  if (why === '') return isTestProject() ? 'Test copy: syncing with the test cloud' : 'Syncing with your other devices';
  if (why === 'paused') return 'Paused';
  if (why === 'kill-switch') return 'Syncing is switched off for now';
  if (isTestProject()) return 'Test cloud: sign in and try syncing with demo data';
  return 'Off: your data stays on this device';
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const n = loadNotifySettings();
  const [stale, setStale] = useState(staleDays);
  const [email] = useState(signedInEmail);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setAccountOpen(false);
    setSigningOut(true);
    try {
      const { signOutThisDevice } = await import('./cloud');
      await signOutThisDevice(); // this device only; other devices stay signed in
    } catch {
      /* the app restarts below either way */
    }
    // Restart Crumb so nothing of the old sign-in stays in memory (synced devices land on Sign In).
    window.location.replace(isRealSynced() ? '/sign-in' : window.location.pathname);
  };
  const [, refresh] = useState(0);
  useCloudRefresh(() => {
    // changes from your other device, re-read in place
    setStale(staleDays());
    refresh((x) => x + 1);
  });
  const app = loadAppSettings();
  const cs = loadCallSheetSettings();
  const offWord = (on, text) => (on ? text : 'Off');
  const [pickStale, setPickStale] = useState(false);
  const setStaleDays = (v) => {
    writeText(STALE_KEY, v); // not critical if it can't save
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
        ? 'Morning summary, end-of-day reminder (to-dos and Daily Stops), heads-ups before visits'
        : 'Off · tap to turn on reminders',
      go: () => navigate('/notifications'),
    },
    // Each tool has its own settings page (Nov 10): a Show switch now, more settings later.
    {
      icon: <IoCalendarOutline />,
      label: 'Calendar',
      sub: offWord(app.calendar, 'Week view, event length, start time, what shows, colors'),
      go: () => navigate('/settings/calendar'),
    },
    {
      icon: <IoLocationOutline />,
      label: 'Daily Stops',
      sub: offWord(app.dailyStops, 'On'),
      go: () => navigate('/settings/daily-stops'),
    },
    {
      icon: <IoCallOutline />,
      label: 'Call Sheet',
      sub: offWord(cs.show, [cs.online ? 'Online ordering' : '', cs.orders ? 'Track orders' : ''].filter(Boolean).join(' · ') || 'On'),
      go: () => navigate('/settings/call-sheet'),
    },
    {
      icon: <IoCheckboxOutline />,
      label: 'To-Do',
      sub: offWord(app.todo, 'On'),
      go: () => navigate('/settings/todo'),
    },
    {
      icon: <IoTimeOutline />,
      label: "Due For A Check-In",
      sub: stale ? `Accounts with no contact in ${stale}+ days (Daily Stops, lists, morning summary)` : 'Off',
      go: () => setPickStale(true),
    },
    {
      icon: <IoCloudOutline />,
      label: 'Cloud',
      sub: syncLine(),
      go: () => navigate('/cloud-test'),
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
        {/* Always here (Nov 8): signing in shouldn't be buried. */}
        <div className="st-group st-group-gap">
            <button
              className="st-row"
              disabled={signingOut}
              onClick={() => (email ? setAccountOpen(true) : navigate('/sign-in', { state: { from: '/settings' } }))}
            >
              <span className="st-row-icon"><IoPersonCircleOutline /></span>
              <span className="st-row-text">
                <span className="st-row-label">Account</span>
                <span className="st-row-sub">{signingOut ? 'Signing out…' : email || 'Not signed in · Tap to sign in and sync'}</span>
              </span>
              <FaChevronRight className="st-row-chev" />
            </button>
        </div>
        <div className="st-group">
          {rows.map((r) => (
            <button key={r.label} className="st-row" onClick={r.go}>
              <span className="st-row-icon">{r.icon}</span>
              <span className="st-row-text">
                {/* Titles only, no line underneath (founder, Nov 10: "not everything needs a description") */}
                <span className="st-row-label">{r.label}</span>
              </span>
              <FaChevronRight className="st-row-chev" />
            </button>
          ))}
        </div>
        <div className="st-group-label">Help</div>
        <div className="st-group">
          {[
            { icon: <IoBugOutline />, label: 'Report A Problem', sub: 'Something not working? Tell us', kind: 'problem' },
            { icon: <IoBulbOutline />, label: 'Make A Suggestion', sub: 'An idea to make Crumb better', kind: 'suggestion' },
          ].map((r) => (
            <button key={r.kind} className="st-row" onClick={() => navigate(`/feedback?kind=${r.kind}`)}>
              <span className="st-row-icon">{r.icon}</span>
              <span className="st-row-text">
                <span className="st-row-label">{r.label}</span>
                <span className="st-row-sub">{r.sub}</span>
              </span>
              <FaChevronRight className="st-row-chev" />
            </button>
          ))}
        </div>
        {/* Backup & Restore sits at the very bottom, below Help (founder, Nov 10) */}
        <div className="st-group st-group-top">
          <button className="st-row" onClick={() => navigate('/backup')}>
            <span className="st-row-icon"><IoCloudUploadOutline /></span>
            <span className="st-row-text">
              <span className="st-row-label">Backup &amp; Restore</span>
              <span className={`st-row-sub ${!last || days >= 7 ? 'is-due' : ''}`}>
                {!last ? 'Never backed up' : days === 0 ? 'Last backup: today' : days === 1 ? 'Last backup: yesterday' : `Last backup: ${days} days ago`}
                {!last || days >= 7 ? ' · time to back up' : ''}
              </span>
            </span>
            <FaChevronRight className="st-row-chev" />
          </button>
        </div>
        <div className="st-version">Crumb Version {APP_VERSION}</div>
      </div>
      {accountOpen && (
        <AskSheet
          title="Account"
          message={`Signed in as ${email}.${isRealSynced() ? ' Signing out stops syncing on this device until you sign in again.' : ''}`}
          choices={[{ label: 'Sign Out', value: 'out' }]}
          onPick={signOut}
          onCancel={() => setAccountOpen(false)}
        />
      )}
      {pickStale && (
        <AskSheet
          title="Due For A Check-In"
          message="Flag accounts with no visit, note or appointment for:"
          choices={[21, 30, 45, 60, 90].map((d) => ({ label: `${d} days${d === stale ? ' ✓' : ''}`, value: d })).concat([{ label: `Off${!stale ? ' ✓' : ''}`, value: 0 }])}
          onPick={setStaleDays}
          onCancel={() => setPickStale(false)}
        />
      )}
    </div>
  );
}
