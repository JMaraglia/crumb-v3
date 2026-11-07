// file: src/CalendarPage.jsx
// Owns the page-level pieces: header, Day/Week/Month switch, month label,
// and the single floating "+" button. WeekView only draws the grid and swiping.
import React, { useState } from 'react';
import { FaArrowLeft, FaCog } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import WeekView, { DAYS_PER_PAGE, dateKey } from './WeekView';
import EventSheet, { DEFAULT_EVENT_COLOR, EVENT_COLORS } from './EventSheet';
import MonthView from './MonthView';
import { scheduledCalendarBlocks, readJSON, toVisitList, addDaysToKey, MEETING_COLOR, hiddenByInactive } from './schedule';
import { removeStop, REMOVED_KEY, HIDDEN_KEY } from './stopRemoval';
import AskSheet from './AskSheet';
import { loadEvents, saveEvents, loadCalendarSettings, saveCalendarSettings } from './store';
import './CalendarPage.css';

// Calendar events are saved on the phone under this name (new; nothing else uses it).

// Calendar settings (the gear). Saved on the phone; included in backups.
const DEFAULT_SETTINGS = {
  eventLength: 60,      // minutes for a new event
  startHour: 7,         // grid opens scrolled to this hour
  weekDays: 5,          // Week view: 5 = Monday–Friday (swipe moves a week), 3 = 3 days from today
  showVisits: false,    // customers' / prospects' scheduled visits (one "Itinerary Visits" switch sets both)
  showStops: false,     // stops added by hand on the Itinerary — off: the Calendar is for commitments
  defaultColor: DEFAULT_EVENT_COLOR,
  colorNames: {},       // { '#34c759': 'Prospect meeting' }
};

// Saved through store.js (the front door).
function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...loadCalendarSettings() };
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
  // Opened from Settings → show the calendar settings right away
  const [showSettings, setShowSettings] = useState(() => {
    try {
      const v = sessionStorage.getItem('crumb_open_cal_settings') === '1';
      sessionStorage.removeItem('crumb_open_cal_settings');
      return v;
    } catch {
      return false;
    }
  });
  const updateSettings = (patch) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveCalendarSettings(next);
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
      saveEvents(next); // a failed save shows the "couldn't save" banner
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
  // Events taken off the Calendar for a day (they can stay on the Itinerary)
  const hiddenMap = readJSON(HIDDEN_KEY, {}) || {};
  // Meetings show orange (older ones were saved on the default blue)
  const meetingIds = new Set();
  [...prospects, ...contacts].forEach((a) =>
    ((a && a.notes) || []).forEach((n) => n && n.meeting && n.meeting.eventId != null && meetingIds.add(String(n.meeting.eventId)))
  );
  const shownEvents = events
    .filter((ev) => !(hiddenMap[ev.date] || []).includes(`e-${ev.id}`))
    .filter((ev) => !hiddenByInactive(ev, contacts, prospects))
    .map((ev) =>
      (ev.meeting || meetingIds.has(String(ev.id))) && (!ev.color || ev.color === DEFAULT_EVENT_COLOR || ev.color === '#0077cc')
        ? { ...ev, color: MEETING_COLOR }
        : ev
    );
  const allEvents = [...shownEvents, ...shownBlocks];

  // Hold a thumb on an event → delete it. If it's also on the Itinerary, ask about that too.
  const [asking, setAsking] = useState(null); // { ev, key, alsoOnItinerary }
  const [, setRemovalTick] = useState(0);    // re-draw after a removal
  const isOnItinerary = (ev, key) => {
    const removed = readJSON(REMOVED_KEY, {}) || {};
    if ((removed[ev.date] || []).includes(key)) return false;
    if (!ev.virtual) return typeof ev.showInItinerary === 'boolean' ? ev.showInItinerary : Boolean(ev.accountId);
    if (ev.source === 'schedule') {
      const list = ev.accountType === 'prospect' ? prospects : contacts;
      const acct = list.find((a) => String(a.id) === String(ev.accountId));
      return !acct || acct.showInItinerary !== false;
    }
    return true;
  };
  const handleEventHold = (ev) => {
    const key = ev.virtual ? ev.stopKey : `e-${ev.id}`;
    if (!key) return;
    setAsking({ ev, key, alsoOnItinerary: isOnItinerary(ev, key) });
  };
  const applyRemoval = (where) => {
    const { ev, key } = asking;
    if (!ev.virtual && where === 'both') updateEvents((prev) => prev.filter((e) => e.id !== ev.id));
    else removeStop(where, key, ev.date);
    setAsking(null);
    setRemovalTick((t) => t + 1);
  };

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

  const weekDays = settings.weekDays === 3 ? 3 : 5;
  // 5-day Week view always starts on a Monday: this week's, or next week's on a Saturday/Sunday.
  const mondayFor = (d) => {
    const wd = d.getDay(); // 0 = Sun … 6 = Sat
    return addDays(d, wd === 6 ? 2 : wd === 0 ? 1 : 1 - wd);
  };
  const weekStart = viewMode === 'Week' && weekDays === 5 ? mondayFor(viewStart) : viewStart;
  const monthLabel =
    viewMode === 'Week'
      ? visibleRangeLabel(weekStart, weekDays)
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
            pageStep={viewMode === 'Week' && weekDays === 5 ? 7 : undefined}
            startDate={weekStart}
            onShift={shiftDays}
            events={allEvents}
            pendingEvent={sheet && sheet.isNew ? sheet.draft : null}
            onHoldSlot={openNewEvent}
            onEventTap={handleEventTap}
            onEventHold={handleEventHold}
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

      {asking && (() => {
        const { ev, alsoOnItinerary } = asking;
        const isVisit = ev.virtual && ev.source === 'schedule';
        const dayText = new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const title = isVisit ? `Remove the ${ev.title} visit on ${dayText}?` : `Delete "${ev.title}"?`;
        const message = [
          isVisit ? 'Just this day. The regular visit schedule stays the same.' : '',
          alsoOnItinerary ? 'Also delete it from the Itinerary?' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const choices = alsoOnItinerary
          ? [
              { label: 'Yes, delete from both', value: 'both', tone: 'danger' },
              { label: 'No, just the Calendar', value: 'calendar' },
            ]
          : [{ label: isVisit ? 'Remove from Calendar' : 'Delete', value: isVisit ? 'calendar' : 'both', tone: 'danger' }];
        return <AskSheet title={title} message={message} choices={choices} onPick={applyRemoval} onCancel={() => setAsking(null)} />;
      })()}

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
              value={settings.weekDays === 3 ? 3 : 5}
              onChange={(e) => onChange({ weekDays: Number(e.target.value) })}
            >
              <option value={5}>Mon–Fri</option>
              <option value={3}>3 days</option>
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
            <span>Show Itinerary Visits</span>
            <input
              type="checkbox"
              className="cal-set-switch"
              checked={Boolean(settings.showVisits || settings.showStops)}
              onChange={(e) => onChange({ showVisits: e.target.checked, showStops: e.target.checked })}
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
