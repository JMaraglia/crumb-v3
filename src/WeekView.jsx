// file: src/WeekView.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft, FaCog } from 'react-icons/fa';
import './WeekView.css';

export default function WeekView({ onBack }) {
  const initialStart = new Date(2025, 5, 22); // Sunday, June 22, 2025
  const [viewStart, setViewStart] = useState(initialStart);
  const [events, setEvents] = useState([]);
  const scrollRef = useRef(null);

  // build 3-day window
  const days = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(viewStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // 5-min slots
  const slots = Array.from({ length: 24 * 12 }, (_, i) => i * 5);

  // update scroll reset on viewStart
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [viewStart]);

  const prev3 = () => setViewStart(d => { d = new Date(d); d.setDate(d.getDate() - 3); return d; });
  const next3 = () => setViewStart(d => { d = new Date(d); d.setDate(d.getDate() + 3); return d; });

  const addEvent = (day, start) => {
    const title = prompt('Event title:'); if (!title) return;
    const dur = parseInt(prompt('Duration minutes (5-min increments):'), 10);
    const colors = ['#1abc9c','#2ecc71','#3498db','#9b59b6','#34495e','#f1c40f','#e67e22','#e74c3c','#95a5a6','#d35400'];
    const idx = parseInt(prompt('Color 1-10:'),10) - 1;
    const color = colors[idx] || colors[0];
    const dateKey = day.toDateString();
    const dayEvents = events.filter(e => e.date===dateKey);
    const overlap = dayEvents.some(e => !(start+dur <= e.start || e.start+e.duration <= start));
    if (overlap && !window.confirm('Overlap detected. Proceed?')) return;
    setEvents(prev => [...prev, { id: Date.now(), date: dateKey, start, duration: dur, title, color }]);
  };

  return (
    <div className="week-view">
      <div className="wv-topbar">
        <button className="wv-back" onClick={onBack}><FaArrowLeft/></button>
        <h2 className="wv-title-main">Calendar</h2>
        <button className="wv-settings"><FaCog/></button>
      </div>

      <div className="wv-toggles">
        <button className="">Day</button>
        <button className="active">Week</button>
        <button className="">Month</button>
      </div>

      <div className="wv-subheader">
        <button className="wv-prev" onClick={prev3}>&lt;</button>
        {days.map(day => (
          <div key={day} className="wv-day-label">
            <div>{day.toLocaleDateString('en-US', { weekday: 'long' })}</div>
            <div>{day.toLocaleDateString('en-US')}</div>
          </div>
        ))}
        <button className="wv-next" onClick={next3}>&gt;</button>
      </div>

      <div className="wv-body">
        <div className="time-column">
          {slots.map(min => {
            const h=Math.floor(min/60), m=min%60;
            const label = m===0 ? `${h===0?12:h>12?h-12:h}:00 ${h<12?'AM':'PM'}` : '';
            return <div key={min} className="time-label-cell">{label}</div>;
          })}
        </div>
        <div className="scroll-container" ref={scrollRef}>
          {days.map(day => (
            <div key={day} className="week-block">
              <div className="week-inner">
                <div className="week-content">
                  <div className="day-headers"></div>
                  <div className="time-grid">
                    {slots.map(min => (
                      <div key={min} className="time-slot" onClick={()=>addEvent(day,min)} />
                    ))}
                    {events
                      .filter(e=>e.date===day.toDateString())
                      .map(ev=> (
                        <div key={ev.id} className="time-slot event"
                          style={{ top:(ev.start/5)*30+'px', height:(ev.duration/5)*30+'px', backgroundColor:ev.color }}>
                          {ev.title}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="add-event-button" onClick={()=>addEvent(days[0],0)}>+</button>
    </div>
  );
}