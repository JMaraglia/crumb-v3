import React, { useState, useEffect, useRef } from 'react';
import './WeekView.css';

function WeekView() {
  const [weeks, setWeeks] = useState(() => generateWeeks(new Date()));
  const [currentMonth, setCurrentMonth] = useState(getMonthName(new Date()));
  const containerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = containerRef.current.scrollTop;
      const weekHeight = 48 * 24; // Assuming 48px per hour (2 rows per hour)
      const currentWeekIndex = Math.floor(scrollTop / weekHeight);
      const referenceDate = new Date();
      referenceDate.setDate(referenceDate.getDate() + (currentWeekIndex * 7));
      setCurrentMonth(getMonthName(referenceDate));

      if (currentWeekIndex >= weeks.length - 2) {
        const lastWeekDate = new Date(weeks[weeks.length - 1]);
        lastWeekDate.setDate(lastWeekDate.getDate() + 7);
        setWeeks(prev => [...prev, ...generateWeeks(lastWeekDate, 5)]);
      }

      if (currentWeekIndex < 2) {
        const firstWeekDate = new Date(weeks[0]);
        firstWeekDate.setDate(firstWeekDate.getDate() - (7 * 5));
        setWeeks(prev => [...generateWeeks(firstWeekDate, 5), ...prev]);
        containerRef.current.scrollTop += weekHeight * 5;
      }
    };

    const ref = containerRef.current;
    if (ref) ref.addEventListener('scroll', handleScroll);
    return () => ref.removeEventListener('scroll', handleScroll);
  }, [weeks]);

  return (
    <div className="week-view">
      <div className="calendar-header">
        <h2 className="calendar-title">{currentMonth}</h2>
      </div>

      <div className="view-switcher">
        <button>Day</button>
        <button className="active">Week</button>
        <button>Month</button>
      </div>

      <div className="scroll-container" ref={containerRef}>
        {weeks.map((weekStart, index) => (
          <div key={index} className="week-block">
            <div className="day-headers">
              {renderDayHeaders(weekStart)}
            </div>
            <div className="time-grid">
              {renderTimeGrid()}
            </div>
          </div>
        ))}
      </div>

      <button className="add-event-button">+</button>
    </div>
  );
}

function generateWeeks(startDate, count = 5) {
  const weeks = [];
  const date = new Date(startDate);
  date.setDate(date.getDate() - (date.getDay() % 7));
  for (let i = 0; i < count; i++) {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() + i * 7);
    weeks.push(new Date(weekStart));
  }
  return weeks;
}

function renderDayHeaders(startDate) {
  const headers = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    headers.push(
      <div key={i} className="day-header">
        <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div>{date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</div>
      </div>
    );
  }
  return headers;
}

function renderTimeGrid() {
  const rows = [];

  for (let hour = 0; hour < 24; hour++) {
    rows.push(
      <div key={`${hour}-full`} className="time-row">
        <div className="time-label">
          {`${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'AM' : 'PM'}`}
        </div>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="time-slot" />
        ))}
      </div>
    );

    rows.push(
      <div key={`${hour}-half`} className="time-row">
        <div className="time-label"></div>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="time-slot" />
        ))}
      </div>
    );
  }

  return rows;
}

function getMonthName(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default WeekView;
