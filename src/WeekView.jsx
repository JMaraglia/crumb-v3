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
    startDate.setDate(startDate.getDate() - startDate.getDay());

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
      // Full hour row
      rows.push(
        <div key={`${hour}-full`} className="time-row">
          <div className="time-label">
            {`${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'AM' : 'PM'}`}
          </div>
          {[...Array(7)].map((_, dayIndex) => (
            <div key={dayIndex} className="time-slot" />
          ))}
        </div>
      );

      // Half hour line
      rows.push(
        <div key={`${hour}-half`} className="time-row">
          <div className="time-label"></div>
          {[...Array(7)].map((_, dayIndex) => (
            <div key={dayIndex} className="time-slot" />
          ))}
        </div>
      );
    }

    return rows;
  };

  return (
    <div className="week-view">
      {/* Header Nav */}
      <div className="calendar-header">
        <button onClick={handlePrev} className="nav-arrow">←</button>
        <h2 className="calendar-title">Calendar</h2>
        <button onClick={handleNext} className="nav-arrow">→</button>
      </div>

      {/* View Mode Switch */}
      <div className="view-switcher">
        <button>Day</button>
        <button className="active">Week</button>
        <button>Month</button>
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid">
        <div className="day-headers">{renderDayHeaders()}</div>
        <div className="time-grid">{renderTimeGrid()}</div>
      </div>

      {/* Add Event Button */}
      <button className="add-event-button">+</button>
    </div>
  );
}

export default WeekView;
