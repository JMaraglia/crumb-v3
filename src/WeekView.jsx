import React, { useState, useEffect, useRef } from 'react';
import './WeekView.css';

function WeekView() {
  const [weeks, setWeeks] = useState(() => generateWeeks(new Date(), 10));
  const [currentMonth, setCurrentMonth] = useState(getMonthName(new Date()));
  const containerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollLeft = containerRef.current.scrollLeft;
      const weekWidth = containerRef.current.offsetWidth;
      const currentWeekIndex = Math.floor(scrollLeft / weekWidth);
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

        requestAnimationFrame(() => {
          containerRef.current.scrollLeft += weekWidth * 5;
        });
      }
    };

    const ref = containerRef.current;
    if (ref) {
      ref.addEventListener('scroll', handleScroll);

      // Scroll to middle week on mount
      const weekWidth = ref.offsetWidth;
      ref.scrollLeft = weekWidth * 5;
    }

    return () => ref.removeEventListener('scroll', handleScroll);
  }, [weeks]);

  return (
    <div className="week-view">
      <div className="scroll-container" ref={containerRef}>
        {weeks.map((weekStart, index) => (
          <div key={index} className="week-block">
            <div className="week-inner">
              <div className="time-column">
                {renderTimeLabels()}
              </div>
              <div className="week-content">
                <div className="day-headers">
                  {renderDayHeaders(weekStart)}
                </div>
                <div className="time-grid">
                  {renderTimeGrid()}
                </div>
              </div>
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

function renderTimeLabels() {
  const labels = [];
  for (let hour = 0; hour < 24; hour++) {
    labels.push(
      <div key={`${hour}-full`} className="time-label-cell">
        {`${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'AM' : 'PM'}`}
      </div>
    );
    labels.push(<div key={`${hour}-half`} className="time-label-cell empty" />);
  }
  return labels;
}

function renderTimeGrid() {
  const rows = [];

  for (let hour = 0; hour < 24; hour++) {
    rows.push(
      <div key={`${hour}-full`} className="time-row">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="time-slot" />
        ))}
      </div>
    );
    rows.push(
      <div key={`${hour}-half`} className="time-row">
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
