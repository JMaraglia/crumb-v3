import React, { useState } from 'react';
import './WeekView.css';

function WeekView() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const renderDayHeaders = () => {
    const headers = [];
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - startDate.getDay()); // start at Sunday

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      headers.push(
        <div key={i} className="day-header">
          <div>{date.toLocaleDateString('en-US', { weekday: 'long' })}</div>
          <div>{date.toLocaleDateString()}</div>
        </div>
      );
    }
    return headers;
  };

  const renderTimeGrid = () => {
    const rows = [];

    for (let hour = 0; hour < 24; hour++) {
      const row = (
        <div key={hour} className="time-row">
          <div className="time-label">
            {`${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'AM' : 'PM'}`}
          </div>
          {[...Array(7)].map((_, dayIndex) => (
            <div key={dayIndex} className="time-slot" />
          ))}
        </div>
      );
      rows.push(row);
    }

    return rows;
  };

  return (
    <div className="week-view">
      {/* Top Nav */}
      <div className="calendar-header">
        <button onClick={handlePrev} className="nav-arrow">←</button>
        <h2 className="calendar-title">Calendar</h2>
        <button onClick={handleNext} className="nav-arrow">→</button>
        <button className="settings-icon">⚙️</button>
      </div>

      {/* View Switch */}
      <div className="view-switcher">
        <button>Day</button>
        <button className="active">Week</button>
        <button>Month</button>
      </div>

      {/* Week Grid */}
      <div className="calendar-grid">
        <div className="time-column-spacer" />
        <div className="day-headers">{renderDayHeaders()}</div>
        <div className="time-grid">{renderTimeGrid()}</div>
      </div>
    </div>
  );
}

export default WeekView;