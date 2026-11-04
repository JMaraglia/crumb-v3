// file: src/HomePage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUsers, FaUserPlus, FaClipboardList, FaCalendarAlt, FaStickyNote, FaPhoneAlt } from 'react-icons/fa';
import { readLastBackup } from './BackupPage';

export default function HomePage() {
  const navigate = useNavigate();
  // Backup reminder under the tiles: orange if never backed up or it's been a week or more
  const last = readLastBackup();
  const lastTime = Date.parse(last);
  const days = lastTime ? Math.floor((Date.now() - lastTime) / 86400000) : null;
  const backupText = !lastTime
    ? 'Back up your data'
    : days === 0
    ? 'Backup · today'
    : days === 1
    ? 'Backup · yesterday'
    : `Backup · ${days} days ago`;
  const backupStale = !lastTime || days >= 7;

  const iconStyle = { fontSize: '3rem', marginBottom: '10px', transition: 'transform 0.3s' };

  const handleHover = e => e.currentTarget.style.transform = 'scale(1.2)';
  const handleLeave = e => e.currentTarget.style.transform = 'scale(1)';

  const tiles = [
    { label: 'Customers', icon: <FaUsers />, path: '/customers' },
    { label: 'Prospects', icon: <FaUserPlus />, path: '/prospects' },
    { label: 'Itinerary', icon: <FaClipboardList />, path: '/itinerary' },
    { label: 'Calendar', icon: <FaCalendarAlt />, path: '/calendar' },
    { label: 'Notes', icon: <FaStickyNote />, path: '/notes' },
    { label: 'Call Sheet', icon: <FaPhoneAlt />, path: '/call-sheet' },
  ];

  return (
    <div className="home-container">
      <h1 className="crumb-logo" style={{ textAlign: 'center', fontSize: '4rem', marginBottom: '10px' }}>
        Crumb.
      </h1>
      <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>
        Taking every last Crumb.
      </h2>
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
      <div
        className={`home-backup ${backupStale ? 'is-stale' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => navigate('/backup')}
        onKeyPress={e => { if (e.key === 'Enter') navigate('/backup'); }}
      >
        {backupText} ›
      </div>
    </div>
  );
}
