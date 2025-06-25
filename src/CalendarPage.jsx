// file: src/CalendarPage.jsx
import React, { useState } from 'react';
import { FaArrowLeft, FaCog } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import WeekView from './WeekView';
import './CalendarPage.css';

export default function CalendarPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('Week');
  const today = new Date();
  const monthYear = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar-page">
      {/* Top bar */}
      <header className="cal-header">
        <button className="cal-btn" onClick={() => navigate(-1)}><FaArrowLeft/></button>
        <h1 className="cal-title">Calendar</h1>
        <button className="cal-btn"><FaCog/></button>
      </header>

      {/* View toggles */}
      <div className="cal-toggles">
        {['Day','Week','Month'].map(mode => (
          <button
            key={mode}
            className={mode === viewMode ? 'active' : ''}
            onClick={() => setViewMode(mode)}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Month label */}
      <div className="cal-month-label">{monthYear}</div>

      {/* Sub-header days with prev/next */}
      <div className="cal-subheader">
        <button className="cal-nav" onClick={() => navigate(-1)}>&lt;</button>
        {[...Array(3)].map((_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() + (i - 1)); // Yesterday, Today, Tomorrow
          return (
            <div key={i} className="cal-day-label">
              <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div>{d.getMonth()+1}/{d.getDate()}/{d.getFullYear()}</div>
            </div>
          );
        })}
        <button className="cal-nav" onClick={() => navigate(1)}>&gt;</button>
      </div>

      {/* Calendar grid */}
      <div className="cal-body">
        {viewMode === 'Week' ? (
          <WeekView />
        ) : (
          <div className="placeholder">{viewMode} View Coming Soon</div>
        )}
      </div>

      {/* Floating + */}
      <button className="cal-add">+</button>
    </div>
  );
}