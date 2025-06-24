// --- HomePage.jsx ---
import React from 'react';
import { FaUsers, FaUserPlus, FaClipboardList, FaCalendarAlt } from 'react-icons/fa';

function HomePage({ onNavigate }) {
  const iconStyle = {
    fontSize: '3rem',
    marginBottom: '10px',
    transition: 'transform 0.3s',
  };

  const handleHover = (e) => {
    e.currentTarget.style.transform = 'scale(1.2)';
  };

  const handleLeave = (e) => {
    e.currentTarget.style.transform = 'scale(1)';
  };

  const tiles = [
    { label: 'Customers', icon: <FaUsers />, onClick: () => onNavigate('customers') }, // <- FIXED
    { label: 'Prospects', icon: <FaUserPlus />, onClick: () => onNavigate('prospects') },
    { label: 'Itinerary', icon: <FaClipboardList />, onClick: () => onNavigate('itinerary') },
    { label: 'Calendar', icon: <FaCalendarAlt />, onClick: () => onNavigate('calendar') },
  ];

  return (
    <div className="home-container">
      <h1 className="crumb-logo" style={{ textAlign: 'center', fontSize: '4rem' }}>Crumb.</h1>
      <h2 style={{ textAlign: 'center', marginBottom: '40px' }}>
        Tracking every last Crumb.
      </h2>
      <div className="tile-grid">
        {tiles.map((tile, i) => (
          <div
            key={i}
            className="tile"
            onClick={tile.onClick}
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

export default HomePage;