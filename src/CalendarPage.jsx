import React, { useState } from 'react';
import './CalendarPage.css';

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

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {/* Time Column */}
        <div className="time-column">
          {[...Array(24)].map((_, hour) => (
            <div key={hour} className="time-cell">
              {`${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'AM' : 'PM'}`}
            </div>
          ))}
        </div>

        {/* Day Columns */}
        {getWeekDates().map((day, i) => (
          <div key={i} className="day-column">
            <div className="day-header">{day.day} {day.number}</div>
            {[...Array(24)].map((_, h) => (
              <React.Fragment key={h}>
                <div className="hour-block"></div>
                <div className="half-hour-line"></div>
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>

      {/* Big Blue + Button */}
      <button className="add-button">+</button>
    </div>
  );
}

export default CalendarPage;
