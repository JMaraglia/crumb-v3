// --- CalendarPage.jsx ---
import React, { useState } from 'react';
import './CalendarPage.css';
import WeekView from './WeekView'; // ✅ Use real scrollable calendar

function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getWeekDates = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay()); // start on Sunday
    return [...Array(7)].map((_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return {
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        number: date.getDate(),
      };
    });
  };

  const getMonthYear = () => {
    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="calendar-page">

      {/* Title */}
      <div className="calendar-title">Calendar</div>

      {/* View Buttons */}
      <div className="view-buttons">
        <button>Day</button>
        <button className="active">Week</button>
        <button>Month</button>
      </div>

      {/* Month Label */}
      <div className="month-label">{getMonthYear()}</div>

      {/* Calendar Grid (replaced with real scrollable week view) */}
      <div className="calendar-grid">
        <WeekView />
      </div>

      {/* Big Blue + Button */}
      <button className="add-button">+</button>
    </div>
  );
}

export default CalendarPage;
