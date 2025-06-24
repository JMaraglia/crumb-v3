// --- CalendarPage.jsx ---
import React, { useState } from 'react';
import './CalendarPage.css';
import WeekView from './WeekView'; // ✅ Import the actual WeekView

function DayView() {
  return (
    <div className="calendar-placeholder">
      Day View (Coming Soon)
    </div>
  );
}

function MonthView() {
  return (
    <div className="calendar-placeholder">
      Month View (Coming Soon)
    </div>
  );
}

function CalendarPage({ itinerary }) {
  const [view, setView] = useState('week');

  const renderView = () => {
    switch (view) {
      case 'day':
        return <DayView />;
      case 'month':
        return <MonthView />;
      case 'week':
      default:
        return <WeekView itinerary={itinerary} />; // ✅ No military time prop
    }
  };

  return (
    <div className="calendar-container">
      <h1 className="calendar-title">Calendar</h1>
      <div className="calendar-toggle">
        <button
          className={view === 'day' ? 'active' : ''}
          onClick={() => setView('day')}
        >
          Day
        </button>
        <button
          className={view === 'week' ? 'active' : ''}
          onClick={() => setView('week')}
        >
          Week
        </button>
        <button
          className={view === 'month' ? 'active' : ''}
          onClick={() => setView('month')}
        >
          Month
        </button>
      </div>
      {renderView()}
    </div>
  );
}

export default CalendarPage;