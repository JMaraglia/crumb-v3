// file: src/HomePage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUsers, FaUserPlus, FaClipboardList, FaCalendarAlt, FaStickyNote, FaPhoneAlt, FaCheckSquare } from 'react-icons/fa';
import { IoSettingsOutline } from 'react-icons/io5';
import { readLastBackup } from './BackupPage';
import { readText } from './store';
import { isRealSynced } from './syncMode';
import { loadCallSheetSettings } from './store';

export default function HomePage() {
  const navigate = useNavigate();
  // Gear turns orange when it's time to back up (never, or a week or more ago)
  const lastBackup = Date.parse(readLastBackup());
  const backupDue = !lastBackup || Date.now() - lastBackup >= 7 * 86400000;

  // "Keep Separate" was picked at sign-in: say so plainly until this device is set up with the account.
  const separate = readText('crumb_setup_separate') === '1' && !isRealSynced();

  const iconStyle = { fontSize: '3rem', marginBottom: '10px', transition: 'transform 0.3s' };

  const handleHover = e => e.currentTarget.style.transform = 'scale(1.2)';
  const handleLeave = e => e.currentTarget.style.transform = 'scale(1)';

  const tiles = [
    { label: 'Customers', icon: <FaUsers />, path: '/customers' },
    { label: 'Pipeline', icon: <FaUserPlus />, path: '/prospects' },
    { label: 'Daily Stops', icon: <FaClipboardList />, path: '/itinerary' },
    { label: 'To-Do', icon: <FaCheckSquare />, path: '/todo' },
    { label: 'Calendar', icon: <FaCalendarAlt />, path: '/calendar' },
    { label: 'Notes', icon: <FaStickyNote />, path: '/notes' },
    ...(loadCallSheetSettings().show ? [{ label: 'Call Sheet', icon: <FaPhoneAlt />, path: '/call-sheet' }] : []),
  ];

  return (
    <div className="home-container">
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
      <h1 className="crumb-logo" style={{ textAlign: 'center', fontSize: '4rem', marginBottom: '10px' }}>
        Crumb.
      </h1>
      <h2 style={{ textAlign: 'center', marginTop: 0, marginBottom: '30px' }}>
        Taking every last Crumb.
      </h2>
      {separate && (
        <div className="home-separate" role="note">
          <span>This device isn’t syncing with your account. Its information stays on this device.</span>
          <button type="button" onClick={() => navigate('/setup')}>Set Up</button>
        </div>
      )}
      <div className="tile-grid">
        {tiles.map(tile => (
          <div
            key={tile.label}
            className="tile"
            role="button"
            tabIndex={0}
            onClick={() => navigate(tile.path)}  // directly navigate
            onKeyPress={e => { if (e.key === 'Enter') navigate(tile.path); }}
            onMouseEnter={handleHover}
            onMouseLeave={handleLeave}
          >
            <div style={iconStyle}>{tile.icon}</div>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
