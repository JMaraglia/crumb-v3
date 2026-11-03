// file: src/CalendarPage.jsx
// Owns the page-level pieces: header, Day/Week/Month switch, month label,
// and the single floating "+" button. WeekView only draws the grid and swiping.
import React, { useState } from 'react';
import { FaArrowLeft, FaCog } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import WeekView, { DAYS_PER_PAGE } from './WeekView';
import './CalendarPage.css';

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

// Month/year label built from the dates actually on screen.
// "November 2026", or "Oct – Nov 2026" when the visible days span two months.
function visibleRangeLabel(start, dayCount) {
  const end = addDays(start, dayCount - 1);
  const long = (d) => d.toLocaleDateString('en-US', { month: 'long' });
  const short = (d) => d.toLocaleDateString('en-US', { month: 'short' });
  if (start.getFullYear() !== end.getFullYear()) {
    return `${short(start)} ${start.getFullYear()} – ${short(end)} ${end.getFullYear()}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${short(start)} – ${short(end)} ${end.getFullYear()}`;
  }
  return `${long(start)} ${start.getFullYear()}`;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('Week');
  // First day shown in Week view. Opens on today.
  const [viewStart, setViewStart] = useState(startOfToday);

  const shiftDays = (n) => setViewStart((d) => addDays(d, n));

  const monthLabel =
    viewMode === 'Week'
      ? visibleRangeLabel(viewStart, DAYS_PER_PAGE)
      : visibleRangeLabel(viewStart, 1);

  return (
    <div className="calendar-page">
      {/* Top bar */}
      <header className="cal-header">
        <button className="cal-icon-btn cal-back" onClick={() => navigate(-1)} aria-label="Back">
          <FaArrowLeft />
        </button>
        <h1 className="cal-title">Calendar</h1>
        <button className="cal-icon-btn" aria-label="Settings">
          <FaCog />
        </button>
      </header>

      {/* Day / Week / Month switch */}
      <div className="cal-toggles">
        {['Day', 'Week', 'Month'].map((mode) => (
          <button
            key={mode}
            className={`cal-toggle ${mode === viewMode ? 'is-active' : ''}`}
            onClick={() => setViewMode(mode)}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Month label */}
      <div className="cal-month-row">
        <div className="cal-month-label">{monthLabel}</div>
      </div>

      {/* Calendar body */}
      <div className="cal-body">
        {viewMode === 'Week' ? (
          <WeekView startDate={viewStart} onShift={shiftDays} />
        ) : (
          <div className="cal-placeholder">{viewMode} view coming soon</div>
        )}
      </div>

      {/* The one floating add button */}
      <button className="cal-add" aria-label="Add event">+</button>
    </div>
  );
}
