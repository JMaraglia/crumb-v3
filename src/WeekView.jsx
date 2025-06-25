// file: src/WeekView.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft, FaRegCalendarPlus } from 'react-icons/fa';
import './WeekView.css';

export default function WeekView({ onBack }) {
  // 1. View start defaults to Monday, June 23, 2025
  const initialStart = new Date(2025, 5, 23);
  const [viewStart, setViewStart] = useState(initialStart);
  const [events, setEvents] = useState([]);
  const scrollRef = useRef(null);
  const [currentMonth, setCurrentMonth] = useState('');

  // 2. Generate visible days (3-day window)
  const visibleDays = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(viewStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // 3. Time slots array for 5-minute increments
  const timeSlots = Array.from({ length: 24 * 12 }, (_, i) => i * 5);

  // 4. Update month label when viewStart changes
  useEffect(() => {
    setCurrentMonth(
      viewStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    );
    // reset scroll to leftmost
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [viewStart]);

  // 5. Navigation handlers
  const handlePrev = () => {
    const d = new Date(viewStart);
    d.setDate(d.getDate() - 3);
    setViewStart(d);
  };
  const handleNext = () => {
    const d = new Date(viewStart);
    d.setDate(d.getDate() + 3);
    setViewStart(d);
  };

  // 6. Add event (prompt-based)
  const handleAddEvent = (day, startMin) => {
    const title = prompt('Event title:');
    if (!title) return;
    const dur = parseInt(prompt('Duration (minutes, multiple of 5):'), 10);
    if (!dur || dur % 5 !== 0) return;
    const colorOptions = ['#1abc9c','#2ecc71','#3498db','#9b59b6','#34495e','#f1c40f','#e67e22','#e74c3c','#95a5a6','#d35400'];
    const idx = parseInt(prompt('Color option 1-10:'), 10) - 1;
    const color = colorOptions[idx] || colorOptions[0];

    const dateKey = day.toDateString();
    const dayEvents = events.filter(e => e.date === dateKey);
    const overlap = dayEvents.some(e => !(startMin + dur <= e.start || e.start + e.duration <= startMin));
    if (overlap && !window.confirm('Overlap detected. Proceed?')) return;

    const newEvent = {
      id: Date.now(),
      date: dateKey,
      start: startMin,
      duration: dur,
      title,
      color,
    };
    setEvents(prev => [...prev, newEvent]);
  };

  return (
    <div className="wv-container">
      <header className="wv-header">
        <button className="wv-back" onClick={onBack}><FaArrowLeft /></button>
        <div className="wv-modes">
          <button disabled>Day</button>
          <button className="active">Week</button>
          <button disabled>Month</button>
        </div>
        <div className="wv-title">{currentMonth}</div>
        <button className="wv-prev" onClick={handlePrev}>&lt;</button>
        <button className="wv-next" onClick={handleNext}>&gt;</button>
        <button className="wv-add" onClick={() => handleAddEvent(visibleDays[0], 0)}><FaRegCalendarPlus /></button>
      </header>

      <div className="wv-body">
        {/* Time labels column */}
        <div className="wv-times">
          {timeSlots.map(min => {
            const h = Math.floor(min / 60);
            const m = min % 60;
            const label = m === 0 ?
              `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'}`
              : '';
            return (
              <div key={min} className="wv-time-cell">
                {label}
              </div>
            );
          })}
        </div>

        {/* Days grid, scrollable */}
        <div className="wv-days" ref={scrollRef}>
          {visibleDays.map(day => {
            const dateKey = day.toDateString();
            const dayEvents = events.filter(e => e.date === dateKey);
            return (
              <div key={dateKey} className="wv-day-col">
                <div className="wv-day-header">
                  <div>{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div>{day.getMonth()+1}/{day.getDate()}</div>
                </div>
                {timeSlots.map(min => (
                  <div
                    key={min}
                    className="wv-slot"
                    onClick={() => handleAddEvent(day, min)}
                  />
                ))}
                {dayEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="wv-event"
                    style={{
                      top: (ev.start / 5) * 20 + 'px',
                      height: (ev.duration / 5) * 20 + 'px',
                      backgroundColor: ev.color,
                    }}
                  >{ev.title}</div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
