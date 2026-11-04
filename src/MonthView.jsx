// file: src/MonthView.jsx
// Month grid (Monday first) with a colored dot per event, iPhone style.
// Tap a day to list its events below; tap the same day again to open it in Day view.
// Swipe left/right to change months (same sliding approach as WeekView).
import React, { useRef, useState } from 'react';
import { dateKey } from './WeekView';
import './MonthView.css';

const SWIPE_DISTANCE = 50;
const SWIPE_MS = 250;
const MAX_DOTS = 4;
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeLabel(minutes) {
  if (minutes >= 1440) return '12:00 AM';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// 6 rows x 7 days, starting on the Monday on or before the 1st.
function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));
}

export default function MonthView({
  selectedDate,     // the day that's selected (its month is the one shown)
  onSelectDate,     // (Date)
  onShiftMonth,     // (+1 / -1)
  onOpenDay,        // (Date) tap a selected day again
  events = [],
  onEventTap,       // (event)
}) {
  const [phase, setPhase] = useState('idle'); // idle | drag | next | prev | back
  const [dragX, setDragX] = useState(0);
  const drag = useRef(null);
  const suppressTap = useRef(false);
  const today = new Date();

  // Group events by day once, sorted by start time.
  const byDay = {};
  events.forEach((ev) => {
    (byDay[ev.date] = byDay[ev.date] || []).push(ev);
  });
  Object.values(byDay).forEach((list) => list.sort((a, b) => a.start - b.start));

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const pages = [-1, 0, 1].map((n) => {
    const d = new Date(year, month + n, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, year: d.getFullYear(), month: d.getMonth() };
  });

  const finishSwipe = (direction) => {
    setPhase(direction);
    setTimeout(() => {
      if (direction === 'next') onShiftMonth(1);
      if (direction === 'prev') onShiftMonth(-1);
      setDragX(0);
      setPhase('idle');
    }, SWIPE_MS);
  };

  const handlePointerDown = (e) => {
    if (phase !== 'idle') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressTap.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, time: Date.now(), moving: false };
  };

  const handlePointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moving) {
      if (Math.abs(dx) < 6) return;
      d.moving = true;
      suppressTap.current = true;
      setPhase('drag');
      if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDragX(dx);
  };

  const handlePointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moving) return;
    const dx = e.clientX - d.x;
    const quickFlick = Math.abs(dx) > 20 && Date.now() - d.time < 250;
    if (dx <= -SWIPE_DISTANCE || (quickFlick && dx < 0)) finishSwipe('next');
    else if (dx >= SWIPE_DISTANCE || (quickFlick && dx > 0)) finishSwipe('prev');
    else finishSwipe('back');
  };

  const handlePointerCancel = () => {
    suppressTap.current = true;
    const d = drag.current;
    drag.current = null;
    if (d && d.moving) finishSwipe('back');
  };

  const handleDayTap = (day) => {
    if (suppressTap.current) return;
    if (sameDay(day, selectedDate)) onOpenDay(day);
    else onSelectDate(day);
  };

  const basePercent = { idle: -100 / 3, drag: -100 / 3, back: -100 / 3, next: -200 / 3, prev: 0 }[phase];
  const stripStyle = {
    transform: `translateX(calc(${basePercent}% + ${phase === 'drag' ? dragX : 0}px))`,
    transition: phase === 'idle' || phase === 'drag' ? 'none' : `transform ${SWIPE_MS}ms ease-out`,
  };

  const selectedEvents = byDay[dateKey(selectedDate)] || [];

  return (
    <div className="mv">
      <div className="mv-weekdays">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="mv-weekday">{w}</div>
        ))}
      </div>

      <div
        className="mv-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="mv-strip" style={stripStyle}>
          {pages.map((page) => (
            <div key={page.key} className="mv-page">
              {monthCells(page.year, page.month).map((day) => {
                const key = dateKey(day);
                const dayEvents = byDay[key] || [];
                const inMonth = day.getMonth() === page.month;
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selectedDate);
                return (
                  <div
                    key={key}
                    className={`mv-cell ${inMonth ? '' : 'is-outside'}`}
                    onClick={() => handleDayTap(day)}
                  >
                    <span
                      className={`mv-num ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                    >
                      {day.getDate()}
                    </span>
                    <span className="mv-dots">
                      {dayEvents.slice(0, MAX_DOTS).map((ev) => (
                        <span key={ev.id} className="mv-dot" style={{ backgroundColor: ev.color }} />
                      ))}
                      {dayEvents.length > MAX_DOTS && <span className="mv-more">+</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected day's events */}
      <div className="mv-list">
        <div className="mv-list-heading">
          {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {selectedEvents.length === 0 ? (
          <div className="mv-empty">No events. Tap + to add one.</div>
        ) : (
          selectedEvents.map((ev) => (
            <div key={ev.id} className="mv-item" onClick={() => onEventTap && onEventTap(ev)}>
              <span className="mv-item-bar" style={{ backgroundColor: ev.color }} />
              <span className="mv-item-text">
                <span className="mv-item-title">{ev.title}</span>
                {(ev.location || ev.virtual) && (
                  <span className="mv-item-location">
                    {[ev.virtual ? (ev.source === 'schedule' ? 'Scheduled visit' : 'Itinerary stop') : null, ev.location]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
              <span className="mv-item-time">
                <span>{timeLabel(ev.start)}</span>
                <span className="mv-item-end">{timeLabel(ev.end)}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
