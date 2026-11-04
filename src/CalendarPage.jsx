// file: src/CalendarPage.jsx
// Owns the page-level pieces: header, Day/Week/Month switch, month label,
// and the single floating "+" button. WeekView only draws the grid and swiping.
import React, { useState } from 'react';
import { FaArrowLeft, FaCog } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import WeekView, { DAYS_PER_PAGE, dateKey } from './WeekView';
import EventSheet, { DEFAULT_EVENT_COLOR, EVENT_COLORS } from './EventSheet';
import MonthView from './MonthView';
import { scheduledCalendarBlocks, readJSON, toVisitList, addDaysToKey } from './schedule';
import './CalendarPage.css';

// Calendar events are saved on the phone under this name (new; nothing else uses it).
const EVENTS_KEY = 'crumb_calendar_events';
const SETTINGS_KEY = 'crumb_calendar_settings';

// Calendar settings (the gear). Saved on the phone; included in backups.
const DEFAULT_SETTINGS = {
  eventLength: 60,      // minutes for a new event
  startHour: 7,         // grid opens scrolled to this hour
  weekDays: DAYS_PER_PAGE, // Week view shows 3 or 5 days (swipe moves that many)
  showVisits: true,     // customers' / prospects' scheduled visits
  showStops: true,      // stops added by hand on the Itinerary
  defaultColor: DEFAULT_EVENT_COLOR,
  colorNames: {},       // { '#34c759': 'Prospect meeting' }
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return saved && typeof saved === 'object' ? { ...DEFAULT_SETTINGS, ...saved } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

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

export default function CalendarPage({ contacts = [], prospects = [] }) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('Week');
  // First day shown in Week view. Opens on today.
  const [viewStart, setViewStart] = useState(startOfToday);

  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const updateSettings = (patch) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* not critical */
      }
      return next;
    });

  const shiftDays = (n) => setViewStart((d) => addDays(d, n));

  // Month view: move to the same day number in the next/previous month
  // (or the last day, if that month is shorter).
  const shiftMonths = (n) =>
    setViewStart((d) => {
      const lastDay = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
      return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), lastDay));
    });

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

  // Customers + prospects the event panel can link to (blank-named ones skipped).
  // Prospects' scheduled visits + hand-added itinerary stops, shown as calendar
  // blocks for about 3 months around the date you're looking at. Built on the fly
  // from their schedules, never saved as events.
  const visitBlocks = scheduledCalendarBlocks(
    prospects,
    toVisitList(readJSON('visitData', [])),
    addDaysToKey(dateKey(viewStart), -45),
    addDaysToKey(dateKey(viewStart), 60),
    contacts
  );
  const shownBlocks = visitBlocks.filter((b) =>
    b.source === 'schedule' ? settings.showVisits : b.source === 'itinerary' ? settings.showStops : true
  );
  const allEvents = [...events, ...shownBlocks];

  // Tapping a scheduled visit opens that prospect (change the schedule there);
  // tapping a hand-added stop opens the itinerary. Real events open the edit panel.
  const handleEventTap = (ev) => {
    if (!ev.virtual) {
      setSheet({ isNew: false, draft: ev });
    } else if (ev.accountType === 'prospect' && ev.accountId) {
      navigate(`/prospects/${ev.accountId}`);
    } else if (ev.accountType === 'customer' && ev.accountId && ev.source === 'schedule') {
      navigate(`/customers/${ev.accountId}`);
    } else {
      navigate('/itinerary');
    }
  };

  const accounts = [
    ...contacts.map((c) => ({ type: 'customer', id: c.id, name: c.name, address: c.address })),
    ...prospects.map((p) => ({ type: 'prospect', id: p.id, name: p.name, address: p.address })),
  ].filter((a) => a.name && a.name.trim());

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
        end: Math.min(start + settings.eventLength, 1440), // length from Calendar settings
        location: '',
        notes: '',
        color: settings.defaultColor || DEFAULT_EVENT_COLOR,
      },
    });
  };

  // The + button. Week view: today at the next half hour.
  // Day and Month views: the day you're looking at (next half hour if it's today, else 9 AM).
  const handleAddButton = () => {
    const now = new Date();
    const nextHalfHour = Math.min(
      Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30,
      23 * 60 + 30
    );
    if (viewMode === 'Week' || dateKey(viewStart) === dateKey(now)) {
      openNewEvent(dateKey(now), nextHalfHour);
    } else {
      openNewEvent(dateKey(viewStart), 9 * 60);
    }
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

  const weekDays = settings.weekDays === 5 ? 5 : 3;
  const monthLabel =
    viewMode === 'Week'
      ? visibleRangeLabel(viewStart, weekDays)
      : visibleRangeLabel(viewStart, 1);

  return (
    <div className="calendar-page">
      {/* Top bar */}
      <header className="cal-header">
        <button className="cal-icon-btn cal-back" onClick={() => navigate(-1)} aria-label="Back">
          <FaArrowLeft />
        </button>
        <h1 className="cal-title">Calendar</h1>
        <button className="cal-icon-btn" aria-label="Calendar settings" onClick={() => setShowSettings(true)}>
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
            daysPerPage={viewMode === 'Day' ? 1 : weekDays}
            startDate={viewStart}
            onShift={shiftDays}
            events={allEvents}
            pendingEvent={sheet && sheet.isNew ? sheet.draft : null}
            onHoldSlot={openNewEvent}
            onEventTap={handleEventTap}
            startHour={settings.startHour}
          />
        ) : (
          <MonthView
            selectedDate={viewStart}
            onSelectDate={setViewStart}
            onShiftMonth={shiftMonths}
            onOpenDay={(day) => {
              setViewStart(day);
              setViewMode('Day');
            }}
            events={allEvents}
            onEventTap={handleEventTap}
          />
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
          existingEvents={allEvents}
          accounts={accounts}
          colorNames={settings.colorNames}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onCancel={() => setSheet(null)}
        />
      )}

      {showSettings && (
        <CalendarSettings settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

const LENGTH_CHOICES = [
  [30, '30 min'],
  [60, '1 hr'],
  [90, '1½ hr'],
  [120, '2 hr'],
];
const START_HOURS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const hourLabel = (h) => (h === 12 ? '12 PM' : `${h} AM`);

/* ---------- The gear: Calendar settings ---------- */
function CalendarSettings({ settings, onChange, onClose }) {
  const setName = (value, name) => {
    const names = { ...(settings.colorNames || {}) };
    if (name.trim()) names[value] = name;
    else delete names[value];
    onChange({ colorNames: names });
  };
  return (
    <div className="cal-set-backdrop" onClick={onClose}>
      <div className="cal-set-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cal-set-top">
          <span />
          <div className="cal-set-title">Calendar settings</div>
          <button className="cal-set-done" onClick={onClose}>Done</button>
        </div>

        <div className="cal-set-group">
          <label className="cal-set-row">
            <span>Week view shows</span>
            <select
              className="cal-set-select"
              value={settings.weekDays === 5 ? 5 : 3}
              onChange={(e) => onChange({ weekDays: Number(e.target.value) })}
            >
              <option value={3}>3 days</option>
              <option value={5}>5 days</option>
            </select>
          </label>
          <label className="cal-set-row">
            <span>New events last</span>
            <select
              className="cal-set-select"
              value={settings.eventLength}
              onChange={(e) => onChange({ eventLength: Number(e.target.value) })}
            >
              {LENGTH_CHOICES.map(([m, l]) => (
                <option key={m} value={m}>{l}</option>
              ))}
            </select>
          </label>
          <label className="cal-set-row">
            <span>Day starts at</span>
            <select
              className="cal-set-select"
              value={settings.startHour}
              onChange={(e) => onChange({ startHour: Number(e.target.value) })}
            >
              {START_HOURS.map((h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="cal-set-section">Show on calendar</div>
        <div className="cal-set-group">
          <label className="cal-set-row">
            <span>
              Scheduled visits
              <span className="cal-set-help">From customers' and prospects' visit schedules</span>
            </span>
            <input
              type="checkbox"
              className="cal-set-switch"
              checked={settings.showVisits}
              onChange={(e) => onChange({ showVisits: e.target.checked })}
            />
          </label>
          <label className="cal-set-row">
            <span>
              Hand-added itinerary stops
              <span className="cal-set-help">Stops added with + on the Itinerary</span>
            </span>
            <input
              type="checkbox"
              className="cal-set-switch"
              checked={settings.showStops}
              onChange={(e) => onChange({ showStops: e.target.checked })}
            />
          </label>
        </div>

        <div className="cal-set-section">Colors</div>
        <div className="cal-set-hint">Tap a color to make it the default for new events. Name colors so you know what they mean.</div>
        <div className="cal-set-group">
          {EVENT_COLORS.map((c) => {
            const isDefault = (settings.defaultColor || DEFAULT_EVENT_COLOR) === c.value;
            return (
              <div key={c.value} className="cal-set-color-row">
                <button
                  className={`cal-set-swatch ${isDefault ? 'is-default' : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => onChange({ defaultColor: c.value })}
                  aria-label={`Make ${c.name} the default`}
                >
                  {isDefault ? '✓' : ''}
                </button>
                <input
                  className="cal-set-name"
                  placeholder={c.name}
                  maxLength={40}
                  value={(settings.colorNames || {})[c.value] || ''}
                  onChange={(e) => setName(c.value, e.target.value)}
                />
                {isDefault && <span className="cal-set-default">Default</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
