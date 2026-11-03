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
const HOLD_MS = 500;         // how long to hold a thumb down to add an event
const MOVE_TOLERANCE = 8;    // px a thumb can wiggle and still count as holding

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

// "2026-11-03" style key, using local time (not UTC).
export function dateKey(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function shortTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

// Light tint of an event color for the block background.
// Mixed with white into a solid color so grid lines don't show through.
function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c * amount + 255 * (1 - amount));
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

// Events that overlap sit side by side, like Google Calendar.
function layoutDayEvents(dayEvents) {
  const sorted = [...dayEvents].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed = [];
  let group = [];
  let groupEnd = -1;
  const closeGroup = () => {
    const lanes = Math.max(1, ...group.map((p) => p.lane + 1));
    group.forEach((p) => { p.lanes = lanes; });
    group = [];
  };
  sorted.forEach((ev) => {
    if (ev.start >= groupEnd && group.length) closeGroup();
    const used = group.filter((p) => p.ev.end > ev.start).map((p) => p.lane);
    let lane = 0;
    while (used.includes(lane)) lane++;
    const item = { ev, lane, lanes: 1 };
    group.push(item);
    placed.push(item);
    groupEnd = Math.max(groupEnd, ev.end);
  });
  if (group.length) closeGroup();
  return placed;
}

function hourLabel(h) {
  if (h === 0) return '12 AM';
  if (h === 12) return 'Noon';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export default function WeekView({
  startDate,
  onShift,
  daysPerPage = DAYS_PER_PAGE, // 3 for Week view, 1 for Day view
  events = [],
  pendingEvent = null,   // the blue block shown while the add panel is open
  onHoldSlot,            // (dateKey, startMinutes) when a thumb is held on an empty spot
  onEventTap,            // (event) when an event block is tapped
}) {
  const [phase, setPhase] = useState('idle'); // idle | drag | next | prev | back
  const [dragX, setDragX] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef(null);
  const drag = useRef(null);
  const holdTimer = useRef(null);
  const suppressTap = useRef(false);
  const lastWheelSwipe = useRef(0);
  const wheelTotal = useRef(0);

  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  useEffect(() => cancelHold, []);

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
  const days = Array.from({ length: daysPerPage * 3 }, (_, i) =>
    addDays(startDate, i - daysPerPage)
  );

  const finishSwipe = (direction) => {
    setPhase(direction);
    setTimeout(() => {
      if (direction === 'next') onShift(daysPerPage);
      if (direction === 'prev') onShift(-daysPerPage);
      setDragX(0);
      setPhase('idle');
    }, SWIPE_MS);
  };

  // Finger / mouse dragging (vertical scrolling is left to the browser).
  const handlePointerDown = (e) => {
    if (phase !== 'idle') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressTap.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, time: Date.now(), moving: false, held: false };

    // Holding a thumb on an empty spot in a day column adds an event there.
    cancelHold();
    const col = e.target.closest && e.target.closest('.wv-col');
    const onEvent = e.target.closest && e.target.closest('.wv-event');
    if (col && !onEvent && onHoldSlot) {
      const pointY = e.clientY;
      const day = col.getAttribute('data-date');
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        const d = drag.current;
        if (!d || d.moving) return;
        d.held = true;
        suppressTap.current = true;
        const y = pointY - col.getBoundingClientRect().top;
        const slot = Math.floor((y / HOUR_HEIGHT) * 2) * 30; // snap down to the half hour
        onHoldSlot(day, Math.min(Math.max(slot, 0), 23 * 60 + 30));
      }, HOLD_MS);
    }
  };

  const handlePointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > MOVE_TOLERANCE || Math.abs(dy) > MOVE_TOLERANCE) cancelHold();
    if (d.held) return;
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
    cancelHold();
    const d = drag.current;
    drag.current = null;
    if (d && d.held) {
      // Lifting the thumb after a hold makes the phone send a tap. The add panel
      // has just opened under that thumb, so swallow the tap or it would land on
      // the panel's background and close it right away.
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 600);
      return;
    }
    if (!d || !d.moving) return;
    const dx = e.clientX - d.x;
    const quickFlick = Math.abs(dx) > 20 && Date.now() - d.time < 250;
    if (dx <= -SWIPE_DISTANCE || (quickFlick && dx < 0)) finishSwipe('next');
    else if (dx >= SWIPE_DISTANCE || (quickFlick && dx > 0)) finishSwipe('prev');
    else finishSwipe('back');
  };

  const handlePointerCancel = () => {
    cancelHold();
    suppressTap.current = true;
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

  // Each day's share of the 3-page strip (1/9 in Week view, 1/3 in Day view).
  const colWidth = { flex: `0 0 calc(100% / ${daysPerPage * 3})` };

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
                <div key={day.toDateString()} className="wv-head-day" style={colWidth}>
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
                const key = dateKey(day);
                const dayEvents = events.filter((ev) => ev.date === key);
                const showPending = pendingEvent && pendingEvent.date === key;
                return (
                  <div key={key} className="wv-col" data-date={key} style={colWidth}>
                    {layoutDayEvents(dayEvents).map(({ ev, lane, lanes }) => {
                      const height = Math.max(((ev.end - ev.start) / 60) * HOUR_HEIGHT, 18);
                      return (
                        <div
                          key={ev.id}
                          className={`wv-event ${ev.virtual ? 'is-visit' : ''}`}
                          style={{
                            top: (ev.start / 60) * HOUR_HEIGHT,
                            height,
                            left: `${(lane / lanes) * 100}%`,
                            width: `${100 / lanes}%`,
                            background: tint(ev.color, 0.2),
                            borderLeftColor: ev.color,
                          }}
                          onClick={() => {
                            if (suppressTap.current || !onEventTap) return;
                            onEventTap(ev);
                          }}
                        >
                          <div className="wv-event-title">{ev.title}</div>
                          {height >= 40 && (
                            <div className="wv-event-time">{shortTime(ev.start)}</div>
                          )}
                        </div>
                      );
                    })}
                    {showPending && (
                      <div
                        className="wv-event wv-event-pending"
                        style={{
                          top: (pendingEvent.start / 60) * HOUR_HEIGHT,
                          height: ((pendingEvent.end - pendingEvent.start) / 60) * HOUR_HEIGHT,
                          left: 0,
                          width: '100%',
                          background: tint(pendingEvent.color, 0.35),
                          borderLeftColor: pendingEvent.color,
                        }}
                      >
                        <div className="wv-event-title">(New event)</div>
                      </div>
                    )}
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
