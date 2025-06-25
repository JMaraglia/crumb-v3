// file: src/HomePage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUsers, FaUserPlus, FaClipboardList, FaCalendarAlt } from 'react-icons/fa';

export default function HomePage() {
  const navigate = useNavigate();
  const iconStyle = { fontSize: '3rem', marginBottom: '10px', transition: 'transform 0.3s' };

  const handleHover = e => e.currentTarget.style.transform = 'scale(1.2)';
  const handleLeave = e => e.currentTarget.style.transform = 'scale(1)';

  const tiles = [
    { label: 'Customers', icon: <FaUsers />, path: '/customers' },
    { label: 'Prospects', icon: <FaUserPlus />, path: '/prospects' },
    { label: 'Itinerary', icon: <FaClipboardList />, path: '/itinerary' },
    { label: 'Calendar', icon: <FaCalendarAlt />, path: '/calendar' },
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
    </div>
  );
}
