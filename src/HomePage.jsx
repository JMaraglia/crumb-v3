// file: src/HomePage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUsers, FaUserPlus, FaClipboardList, FaCalendarAlt, FaStickyNote, FaPhoneAlt, FaCheckSquare } from 'react-icons/fa';
import { IoSettingsOutline } from 'react-icons/io5';
import { readLastBackup } from './BackupPage';
import { readText } from './store';
import { isRealSynced } from './syncMode';
import { loadCallSheetSettings, loadAppSettings } from './store';

export default function HomePage() {
  const navigate = useNavigate();
  // Gear turns orange when it's time to back up (never, or a week or more ago)
  const lastBackup = Date.parse(readLastBackup());
  const backupDue = !lastBackup || Date.now() - lastBackup >= 7 * 86400000;

  // "Keep Separate" was picked at sign-in: say so plainly until this device is set up with the account.
  const separate = readText('crumb_setup_separate') === '1' && !isRealSynced();

  const iconStyle = { transition: 'transform 0.3s' };

  const handleHover = e => e.currentTarget.style.transform = 'scale(1.2)';
  const handleLeave = e => e.currentTarget.style.transform = 'scale(1)';

  const on = loadAppSettings(); // tools switched off in Settings don't get a tile
  const tiles = [
    { label: 'Customers', icon: <FaUsers />, path: '/customers' },
    { label: 'Pipeline', icon: <FaUserPlus />, path: '/prospects' },
    ...(on.dailyStops ? [{ label: 'Daily Stops', icon: <FaClipboardList />, path: '/itinerary' }] : []),
    ...(on.todo ? [{ label: 'To-Do', icon: <FaCheckSquare />, path: '/todo' }] : []),
    ...(on.calendar ? [{ label: 'Calendar', icon: <FaCalendarAlt />, path: '/calendar' }] : []),
    { label: 'Notes', icon: <FaStickyNote />, path: '/notes' },
    ...(loadCallSheetSettings().show ? [{ label: 'Call Sheet', icon: <FaPhoneAlt />, path: '/call-sheet' }] : []),
  ];

  return (
    <div className="home-container home-page">
      <div
        className={`home-gear ${backupDue ? 'is-due' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={backupDue ? 'Settings (time to back up)' : 'Settings'}
        onClick={() => navigate('/settings')}
        onKeyPress={e => { if (e.key === 'Enter') navigate('/settings'); }}
      >
        <IoSettingsOutline />
      </div>
      {/* Nov 11 refresh: smaller header, so all the tools fit on one screen */}
      <h1 className="crumb-logo home-logo">Crumb.</h1>
      <p className="home-tagline">Taking every last Crumb.</p>
      {separate && (
        <div className="home-separate" role="note">
          <span>This device isn’t syncing with your account. Its information stays on this device.</span>
          <button type="button" onClick={() => navigate('/setup')}>Set Up</button>
        </div>
      )}
      <div className="home-grid">
        {tiles.map((tile, i) => (
          <div
            key={tile.label}
            // An odd number of tools showing: the last one goes full width, so the grid stays even.
            className={`home-tile ${tiles.length % 2 === 1 && i === tiles.length - 1 ? 'is-wide' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => navigate(tile.path)}  // directly navigate
            onKeyPress={e => { if (e.key === 'Enter') navigate(tile.path); }}
            onMouseEnter={handleHover}
            onMouseLeave={handleLeave}
          >
            <div className="home-tile-icon" style={iconStyle}>{tile.icon}</div>
            <span className="home-tile-label">{tile.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
