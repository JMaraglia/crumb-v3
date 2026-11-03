// file: src/WeekView.jsx
// Draws only the grid: day headers, the fixed time column, hour/half-hour
// lines, and horizontal swiping. Page-level controls live in CalendarPage.
//
// How swiping works: three "pages" of days are drawn side by side
// (previous, current, next). Your finger drags them; on release they slide
// to the next or previous page, then the start date moves and the strip
// quietly resets to the middle. That's what makes it endless in both
// directions without jumping.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './WeekView.css';

export const DAYS_PER_PAGE = 3;
const HOUR_HEIGHT = 60;      // px per hour; the half-hour line sits at 30px
const SWIPE_DISTANCE = 50;   // px of drag needed to change pages
const SWIPE_MS = 250;        // slide animation length
const SCROLL_TO_HOUR = 7;    // opens scrolled to 7 AM

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function hourLabel(h) {
  if (h === 0) return '12 AM';
  if (h === 12) return 'Noon';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export default function WeekView({ startDate, onShift }) {
  const [phase, setPhase] = useState('idle'); // idle | drag | next | prev | back
  const [dragX, setDragX] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef(null);
  const drag = useRef(null);
  const lastWheelSwipe = useRef(0);
  const wheelTotal = useRef(0);

  // Open scrolled to the morning instead of midnight.
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT - 10;
    }
  }, []);

  // Keep the red "now" line current.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Previous page + current page + next page.
  const days = Array.from({ length: DAYS_PER_PAGE * 3 }, (_, i) =>
    addDays(startDate, i - DAYS_PER_PAGE)
  );

  const finishSwipe = (direction) => {
    setPhase(direction);
    setTimeout(() => {
      if (direction === 'next') onShift(DAYS_PER_PAGE);
      if (direction === 'prev') onShift(-DAYS_PER_PAGE);
      setDragX(0);
      setPhase('idle');
    }, SWIPE_MS);
  };

  // Finger / mouse dragging (vertical scrolling is left to the browser).
  const handlePointerDown = (e) => {
    if (phase !== 'idle') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, time: Date.now(), moving: false };
  };

  const handlePointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moving) {
      if (Math.abs(dx) < 6) return;
      d.moving = true;
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
    const d = drag.current;
    drag.current = null;
    if (d && d.moving) finishSwipe('back');
  };

  // Two-finger sideways swipe on a laptop trackpad.
  const handleWheel = (e) => {
    if (phase !== 'idle') return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    if (Date.now() - lastWheelSwipe.current < 700) return;
    wheelTotal.current += e.deltaX;
    if (Math.abs(wheelTotal.current) > 80) {
      const direction = wheelTotal.current > 0 ? 'next' : 'prev';
      wheelTotal.current = 0;
      lastWheelSwipe.current = Date.now();
      finishSwipe(direction);
    }
  };

  // Middle page sits at -33.33% of the strip; next page at -66.67%; previous at 0.
  const basePercent = { idle: -100 / 3, drag: -100 / 3, back: -100 / 3, next: -200 / 3, prev: 0 }[phase];
  const dragPx = phase === 'drag' ? dragX : 0;
  const stripStyle = {
    transform: `translateX(calc(${basePercent}% + ${dragPx}px))`,
    transition: phase === 'idle' || phase === 'drag' ? 'none' : `transform ${SWIPE_MS}ms ease-out`,
  };

  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT;

  return (
    <div
      className="wv"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onWheel={handleWheel}
    >
      {/* Day headers (move with the grid) */}
      <div className="wv-head">
        <div className="wv-corner" />
        <div className="wv-viewport">
          <div className="wv-strip" style={stripStyle}>
            {days.map((day) => {
              const today = isSameDay(day, now);
              return (
                <div key={day.toDateString()} className="wv-head-day">
                  <span className={`wv-weekday ${today ? 'is-today' : ''}`}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className={`wv-date ${today ? 'is-today' : ''}`}>{day.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scrollable hours: fixed time column on the left, days beside it */}
      <div className="wv-scroll" ref={scrollRef}>
        <div className="wv-body" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="wv-times">
            {HOURS.map((h) => (
              <div key={h} className="wv-time" style={{ top: h * HOUR_HEIGHT }}>
                {hourLabel(h)}
              </div>
            ))}
          </div>

          <div className="wv-viewport">
            <div className="wv-strip" style={stripStyle}>
              {days.map((day) => {
                const today = isSameDay(day, now);
                return (
                  <div key={day.toDateString()} className="wv-col">
                    {today && <div className="wv-now" style={{ top: nowTop }} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
