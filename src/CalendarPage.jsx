// file: src/CalendarPage.jsx
import React, { useState } from 'react';
import { FaArrowLeft, FaCog } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import WeekView from './WeekView';
import './CalendarPage.css';

export default function CalendarPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('Week');
  const [viewStart, setViewStart] = useState(new Date(2025, 5, 22)); // Sunday, 6/22/2025

  const monthYear = viewStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const days = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(viewStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const prev3 = () => setViewStart(d => { d = new Date(d); d.setDate(d.getDate() - 3); return d; });
  const next3 = () => setViewStart(d => { d = new Date(d); d.setDate(d.getDate() + 3); return d; });

  return (
    <div className="calendar-page">
      {/* Top bar */}
      <header className="cal-header">
        <button className="cal-btn" onClick={() => navigate(-1)}><FaArrowLeft/></button>
        <h1 className="cal-title">Calendar</h1>
        <button className="cal-btn"><FaCog/></button>
      </header>

      {/* Day/Week/Month toggles */}
      <div className="cal-toggles">
        {['Day','Week','Month'].map(mode => (
          <button
            key={mode}
            className={mode === viewMode ? 'active' : ''}
            onClick={() => setViewMode(mode)}
          >{mode}</button>
        ))}
      </div>

      {/* Month label */}
      <div className="cal-month-label">{monthYear}</div>

      {/* Sub-header with prev/next and day labels */}
      <div className="cal-subheader">
        <button className="cal-nav" onClick={prev3}>&lt;</button>
        {days.map((d, i) => (
          <div key={i} className="cal-day-label">
            <div>{d.toLocaleDateString('en-US',{weekday:'short'})}</div>
            <div>{d.getMonth()+1}/{d.getDate()}/{d.getFullYear()}</div>
          </div>
        ))}
        <button className="cal-nav" onClick={next3}>&gt;</button>
      </div>

      {/* Calendar grid body */}
      <div className="cal-body">
        {viewMode === 'Week'
          ? <WeekView viewStart={viewStart} />
          : <div className="placeholder">{viewMode} View Coming Soon</div>
        }
      </div>

      {/* Floating add button */}
      <button className="cal-add">+</button>
    </div>
  );
}