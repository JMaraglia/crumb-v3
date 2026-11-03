// file: src/CalendarPage.jsx
// Owns the page-level pieces: header, Day/Week/Month switch, month label,
// and the single floating "+" button. WeekView only draws the grid and swiping.
import React, { useState } from 'react';
import { FaArrowLeft, FaCog } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import WeekView, { DAYS_PER_PAGE, dateKey } from './WeekView';
import EventSheet, { DEFAULT_EVENT_COLOR } from './EventSheet';
import './CalendarPage.css';

// Calendar events are saved on the phone under this name (new; nothing else uses it).
const EVENTS_KEY = 'crumb_calendar_events';

function loadEvents() {
  try {
    const saved = JSON.parse(localStorage.getItem(EVENTS_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

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

  // Saved events. Only written to the phone when you add, edit, or delete,
  // so opening the calendar can never wipe what's stored.
  const [events, setEvents] = useState(loadEvents);
  const updateEvents = (change) => {
    setEvents((prev) => {
      const next = change(prev);
      localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  // The add/edit panel. null when closed.
  const [sheet, setSheet] = useState(null); // { isNew, draft }

  const openNewEvent = (day, start) => {
    setSheet({
      isNew: true,
      draft: {
        id: Date.now(),
        title: '',
        date: day,
        start,
        end: Math.min(start + 60, 1440), // one hour by default
        location: '',
        notes: '',
        color: DEFAULT_EVENT_COLOR,
      },
    });
  };

  // The + button: today, at the next half hour.
  const handleAddButton = () => {
    const now = new Date();
    const nextHalfHour = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30;
    openNewEvent(dateKey(now), Math.min(nextHalfHour, 23 * 60 + 30));
  };

  const saveEvent = (event) => {
    updateEvents((prev) =>
      prev.some((e) => e.id === event.id)
        ? prev.map((e) => (e.id === event.id ? event : e))
        : [...prev, event]
    );
    setSheet(null);
  };

  const deleteEvent = (id) => {
    if (!window.confirm('Delete this event?')) return;
    updateEvents((prev) => prev.filter((e) => e.id !== id));
    setSheet(null);
  };

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
        {viewMode === 'Week' || viewMode === 'Day' ? (
          <WeekView
            daysPerPage={viewMode === 'Day' ? 1 : DAYS_PER_PAGE}
            startDate={viewStart}
            onShift={shiftDays}
            events={events}
            pendingEvent={sheet && sheet.isNew ? sheet.draft : null}
            onHoldSlot={openNewEvent}
            onEventTap={(ev) => setSheet({ isNew: false, draft: ev })}
          />
        ) : (
          <div className="cal-placeholder">{viewMode} view coming soon</div>
        )}
      </div>

      {/* The one floating add button */}
      <button className="cal-add" aria-label="Add event" onClick={handleAddButton}>+</button>

      {/* Add / edit panel */}
      {sheet && (
        <EventSheet
          key={sheet.draft.id}
          draft={sheet.draft}
          isNew={sheet.isNew}
          existingEvents={events}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onCancel={() => setSheet(null)}
        />
      )}
    </div>
  );
}
