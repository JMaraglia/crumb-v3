import React from 'react';
import { useNavigate } from 'react-router-dom';

function HomePage({ onNavigate }) {
  const navigate = useNavigate();

  const handleClick = (path) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      navigate(`/${path}`);
    }
  };

  return (
    <div className="homepage">
      <h1 className="app-title">Crumb</h1>
      <div className="tile-container">
        <div className="tile" onClick={() => handleClick('customers')}>
          <h2>Customers</h2>
        </div>
        <div className="tile" onClick={() => handleClick('prospects')}>
          <h2>Prospects</h2>
        </div>
        <div className="tile" onClick={() => handleClick('calendar')}>
          <h2>Calendar</h2>
        </div>
        <div className="tile" onClick={() => handleClick('itinerary')}>
          <h2>Itinerary</h2>
        </div>
      </div>
    </div>
  );
}

export default HomePage;