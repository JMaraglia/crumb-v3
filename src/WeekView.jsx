import React, { useState } from 'react';
import './WeekView.css';

function WeekView() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const renderDays = () => {
    const days = [];
    const baseDate = new Date(currentDate);
    baseDate.setDate(baseDate.getDate() - baseDate.getDay()); // start at Sunday

    for (let i = 0; i < 7; i++) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);
      days.push(
        <div key={i} className="day-column">
          <div className="day-header">
            <div>{date.toLocaleDateString('en-US', { weekday: 'long' })}</div>
            <div>{date.toLocaleDateString()}</div>
          </div>
          <div className="day-body">
            {[...Array(24)].map((_, hour) => (
              <div key={hour} className="time-slot">
                {/* empty slot */}
              </div>
            ))}
          </div>
        </div>
      );
    }
    return days;
  };

  return (
    <div className="week-view">
      {/* Header Bar */}
      <div className="calendar-header">
        <button onClick={handlePrev} className="nav-arrow">←</button>
        <h2 className="calendar-title">Calendar</h2>
        <button onClick={handleNext} className="nav-arrow">→</button>
        <button className="settings-icon">⚙️</button>
      </div>

      {/* View Switcher */}
      <div className="view-switcher">
        <button>Day</button>
        <button className="active">Week</button>
        <button>Month</button>
      </div>

      {/* Time Labels + Days */}
      <div className="calendar-grid">
        <div className="time-column">
          {[...Array(24)].map((_, hour) => (
            <div key={hour} className="time-label">
              {`${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'AM' : 'PM'}`}
            </div>
          ))}
        </div>
        <div className="days-container">{renderDays()}</div>
      </div>
    </div>
  );
}

export default WeekView;
