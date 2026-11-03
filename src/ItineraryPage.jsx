// file: src/ItineraryPage.jsx
// Day-by-day checklist of stops, filled in automatically from:
//   1. prospects' visit schedules (days + usual time + how often), unless "Show in itinerary" is off
//   2. calendar events linked to an account (or any event switched to "Show in itinerary")
//   3. stops added by hand (saved in visitData, same as before; old saved visits still show)
// Tap a stop for Contact / Map and a quick note that saves to that account as a "Visit" note.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import {
  DAYS,
  FREQUENCIES,
  TIME_OPTIONS,
  timeLabel,
  stageInfo,
  lastNote,
  shortDate,
  ActionSheet,
  mapActions,
  contactSheet,
} from './AccountViews';
import './ItineraryPage.css';

const VISITS_KEY = 'visitData';                     // stops added by hand (existing key)
const DONE_KEY = 'crumb_itinerary_done';            // checkmarks for scheduled/event stops
const EVENTS_KEY = 'crumb_calendar_events';         // calendar events (read only here)

/* ---------- small helpers ---------- */
function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(k, n) {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}
function weekdayName(k) {
  return DAYS[(fromKey(k).getDay() + 6) % 7]; // Mon=0 … Sun=6
}
function mondayOf(k) {
  const d = fromKey(k);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
// Saved visits should be a list. If they were stored as an object
// (e.g. {} or grouped by date), turn them into a list instead of crashing.
function toVisitList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.values(value).flat().filter((v) => v && typeof v === 'object');
  }
  return [];
}
// "HH:MM" (old saved visits) → minutes from midnight
function hhmmToMinutes(t) {
  if (!t || typeof t !== 'string' || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToHhmm(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Is this prospect scheduled on this date?
function scheduledOn(account, dateKey) {
  if (account.showInItinerary === false) return false;
  const days = account.deliveryDays || [];
  if (!days.includes(weekdayName(dateKey))) return false;
  const freq = FREQUENCIES.find((f) => f.key === account.visitFrequency) || FREQUENCIES[0];
  if (freq.weeks === 1 || !account.visitStart) return true;
  if (dateKey < account.visitStart) return false;
  const weeks = Math.round((mondayOf(dateKey) - mondayOf(account.visitStart)) / (7 * 24 * 3600 * 1000));
  return weeks % freq.weeks === 0;
}

function niceDate(k) {
  return fromKey(k).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/* ---------- page ---------- */
function ItineraryPage({ contacts = [], setContacts, prospects = [], setProspects }) {
  const navigate = useNavigate();
  const today = keyOf(new Date());
  const [date, setDate] = useState(today);
  const [openKey, setOpenKey] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savedFlash, setSavedFlash] = useState('');
  const [sheet, setSheet] = useState(null);
  const [adding, setAdding] = useState(false);

  const [visits, setVisits] = useState(() => toVisitList(readJSON(VISITS_KEY, [])));
  const [doneMap, setDoneMap] = useState(() => readJSON(DONE_KEY, {}));
  const events = toVisitList(readJSON(EVENTS_KEY, []));

  const saveVisits = (next) => {
    setVisits(next);
    localStorage.setItem(VISITS_KEY, JSON.stringify(next));
  };
  const saveDone = (next) => {
    setDoneMap(next);
    localStorage.setItem(DONE_KEY, JSON.stringify(next));
  };

  const findAccount = (type, id) =>
    type === 'prospect'
      ? prospects.find((p) => String(p.id) === String(id))
      : type === 'customer'
      ? contacts.find((c) => String(c.id) === String(id))
      : null;

  /* ---- build today's stops ---- */
  const doneToday = doneMap[date] || [];
  const stops = [];

  prospects
    .filter((p) => p.name && p.name.trim() && scheduledOn(p, date))
    .forEach((p) => {
      const key = `p-${p.id}`;
      const st = stageInfo(p.stage);
      stops.push({
        key,
        kind: 'scheduled',
        time: typeof p.visitTime === 'number' ? p.visitTime : null,
        title: p.name,
        address: p.address,
        tag: { label: st ? st.label : 'Prospect', color: st ? st.color : '#0077cc' },
        color: st ? st.color : '#0077cc',
        accountType: 'prospect',
        accountId: p.id,
        done: doneToday.includes(key),
      });
    });

  events
    .filter((ev) => ev.date === date)
    .filter((ev) => (typeof ev.showInItinerary === 'boolean' ? ev.showInItinerary : Boolean(ev.accountId)))
    .forEach((ev) => {
      const key = `e-${ev.id}`;
      stops.push({
        key,
        kind: 'event',
        time: ev.start,
        endTime: ev.end,
        title: ev.title,
        address: ev.location,
        tag: { label: 'Calendar', color: ev.color || '#0077cc' },
        color: ev.color || '#0077cc',
        accountType: ev.accountType,
        accountId: ev.accountId,
        done: doneToday.includes(key),
      });
    });

  visits.forEach((v, index) => {
    if (v.date !== date) return;
    const acct = v.accountId ? findAccount(v.accountType, v.accountId) : null;
    stops.push({
      key: `m-${v.id || index}`,
      kind: 'manual',
      index,
      time: hhmmToMinutes(v.time),
      title: (acct && acct.name) || v.name || '(No name)',
      address: (acct && acct.address) || '',
      tag: { label: v.accountType === 'customer' || v.type === 'contact' ? 'Customer' : 'Prospect', color: '#8e8e93' },
      color: '#8e8e93',
      accountType: v.accountType || null,
      accountId: v.accountId || null,
      done: Boolean(v.done),
    });
  });

  stops.sort((a, b) => (a.time == null ? 9999 : a.time) - (b.time == null ? 9999 : b.time));
  const doneCount = stops.filter((s) => s.done).length;

  /* ---- actions ---- */
  const toggleDone = (stop) => {
    if (stop.kind === 'manual') {
      const next = visits.map((v, i) => (i === stop.index ? { ...v, done: !v.done } : v));
      saveVisits(next);
    } else {
      const list = doneMap[date] || [];
      const nextList = list.includes(stop.key) ? list.filter((k) => k !== stop.key) : [...list, stop.key];
      saveDone({ ...doneMap, [date]: nextList });
    }
  };

  const openStop = (stop) => {
    setNoteText('');
    setSavedFlash('');
    setOpenKey((cur) => (cur === stop.key ? null : stop.key));
  };

  // Quick note → saved on the account as a "Visit" note
  const saveQuickNote = (stop) => {
    const text = noteText.trim();
    if (!text || !stop.accountId) return;
    const note = { text, category: 'Visit', timestamp: new Date().toLocaleString() };
    const add = (list) =>
      list.map((a) => (String(a.id) === String(stop.accountId) ? { ...a, notes: [...(a.notes || []), note] } : a));
    if (stop.accountType === 'prospect' && setProspects) setProspects(add);
    if (stop.accountType === 'customer' && setContacts) setContacts(add);
    setNoteText('');
    setSavedFlash('Saved to notes');
  };

  const removeManual = (stop) => {
    if (!window.confirm('Remove this stop?')) return;
    saveVisits(visits.filter((_, i) => i !== stop.index));
    setOpenKey(null);
  };

  const changeDay = (n) => {
    setDate((d) => addDays(d, n));
    setOpenKey(null);
  };

  return (
    <div className="it-page">
      <header className="it-header">
        <button className="it-icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <FaArrowLeft />
        </button>
        <div className="it-header-title">Itinerary</div>
        <span />
      </header>

      <div className="it-content">
        {/* Day picker: arrows + tap the date to jump */}
        <div className="it-day">
          <button className="it-arrow" onClick={() => changeDay(-1)} aria-label="Previous day">
            <FaChevronLeft />
          </button>
          <label className="it-date">
            <span className="it-date-main">{date === today ? 'Today' : niceDate(date).split(',')[0]}</span>
            <span className="it-date-sub">
              {date === today ? niceDate(date) : niceDate(date).split(', ').slice(1).join(', ')}
            </span>
            <input
              type="date"
              className="it-date-input"
              value={date}
              onChange={(e) => e.target.value && (setDate(e.target.value), setOpenKey(null))}
            />
          </label>
          <button className="it-arrow" onClick={() => changeDay(1)} aria-label="Next day">
            <FaChevronRight />
          </button>
        </div>

        {stops.length > 0 && (
          <div className="it-progress">
            <div className="it-progress-text">
              {doneCount} of {stops.length} done
            </div>
            <div className="it-progress-bar">
              <div className="it-progress-fill" style={{ width: `${(doneCount / stops.length) * 100}%` }} />
            </div>
          </div>
        )}

        {stops.length === 0 ? (
          <div className="it-empty">
            No stops this day.
            <br />
            Set visit days on a prospect, link a calendar event, or tap + to add one.
          </div>
        ) : (
          <div className="it-list">
            {stops.map((stop) => {
              const open = openKey === stop.key;
              const acct = stop.accountId ? findAccount(stop.accountType, stop.accountId) : null;
              const latest = acct ? lastNote(acct) : null;
              return (
                <div key={stop.key} className={`it-stop ${stop.done ? 'is-done' : ''} ${open ? 'is-open' : ''}`}>
                  <div className="it-stop-row">
                    <button className="it-stop-main" onClick={() => openStop(stop)}>
                      <span className="it-time">{stop.time == null ? 'Anytime' : timeLabel(stop.time)}</span>
                      <span className="it-bar" style={{ background: stop.color }} />
                      <span className="it-stop-text">
                        <span className="it-stop-title">{stop.title}</span>
                        {stop.address && <span className="it-stop-sub">{stop.address}</span>}
                        <span className="it-tag" style={{ color: stop.tag.color, borderColor: stop.tag.color }}>
                          {stop.tag.label}
                        </span>
                      </span>
                    </button>
                    <button
                      className={`it-check ${stop.done ? 'is-checked' : ''}`}
                      onClick={() => toggleDone(stop)}
                      aria-label={stop.done ? 'Mark not done' : 'Mark done'}
                    >
                      {stop.done ? '✓' : ''}
                    </button>
                  </div>

                  {open && (
                    <div className="it-expand">
                      {latest && (
                        <div className="it-last-note">
                          <span className="it-last-note-date">{shortDate(latest.timestamp)}</span>
                          {latest.text}
                        </div>
                      )}
                      <div className="it-quick">
                        <button
                          className="it-quick-btn"
                          disabled={!acct || !contactSheet(acct.contacts)}
                          onClick={() => setSheet(contactSheet(acct.contacts))}
                        >
                          Contact
                        </button>
                        <button
                          className="it-quick-btn"
                          disabled={!stop.address}
                          onClick={() => setSheet({ title: stop.address, actions: mapActions(stop.address) })}
                        >
                          Map
                        </button>
                        {acct && (
                          <button
                            className="it-quick-btn"
                            onClick={() =>
                              navigate(stop.accountType === 'prospect' ? `/prospects/${acct.id}` : `/notes/${acct.id}`)
                            }
                          >
                            {stop.accountType === 'prospect' ? 'Open' : 'Notes'}
                          </button>
                        )}
                      </div>
                      {acct ? (
                        <div className="it-note">
                          <textarea
                            className="it-note-input"
                            rows={2}
                            placeholder="Quick note (saves to their notes)…"
                            value={noteText}
                            onChange={(e) => {
                              setNoteText(e.target.value);
                              setSavedFlash('');
                            }}
                          />
                          <div className="it-note-actions">
                            <span className="it-flash">{savedFlash}</span>
                            <button
                              className="it-note-save"
                              disabled={!noteText.trim()}
                              onClick={() => saveQuickNote(stop)}
                            >
                              Save note
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="it-hint-inline">Not linked to a customer or prospect, so notes can't be saved here.</div>
                      )}
                      {stop.kind === 'manual' && (
                        <button className="it-remove" onClick={() => removeManual(stop)}>
                          Remove stop
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {stops.length > 0 && <div className="it-hint">Tap a stop for details and a quick note · Tap ○ when done</div>}
      </div>

      <button className="it-fab" onClick={() => setAdding(true)} aria-label="Add stop">
        +
      </button>

      {adding && (
        <AddStopSheet
          date={date}
          accounts={[
            ...contacts.map((c) => ({ type: 'customer', id: c.id, name: c.name, address: c.address })),
            ...prospects.map((p) => ({ type: 'prospect', id: p.id, name: p.name, address: p.address })),
          ].filter((a) => a.name && a.name.trim())}
          onCancel={() => setAdding(false)}
          onAdd={(stop) => {
            saveVisits([...visits, stop]);
            setAdding(false);
          }}
        />
      )}

      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ---------- Add a stop by hand ---------- */
function AddStopSheet({ date, accounts, onAdd, onCancel }) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(null);
  const [time, setTime] = useState(9 * 60);

  const matches = search.trim()
    ? accounts.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];
  const name = picked ? picked.name : search.trim();

  const add = () => {
    if (!name) return;
    onAdd({
      id: Date.now(),
      name,
      time: minutesToHhmm(time),
      date,
      done: false,
      recurrence: 'none',
      type: picked && picked.type === 'customer' ? 'contact' : 'prospect',
      accountType: picked ? picked.type : null,
      accountId: picked ? picked.id : null,
    });
  };

  return (
    <div className="it-sheet-backdrop" onClick={onCancel}>
      <div className="it-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="it-sheet-top">
          <button className="it-link" onClick={onCancel}>Cancel</button>
          <div className="it-sheet-title">Add stop · {fromKey(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          <button className="it-link it-bold" disabled={!name} onClick={add}>Add</button>
        </div>

        <div className="it-sheet-group">
          {picked ? (
            <div className="it-picked">
              <span className="it-picked-name">{picked.name}</span>
              <span className="it-picked-type">{picked.type === 'prospect' ? 'Prospect' : 'Customer'}</span>
              <button className="it-picked-clear" onClick={() => setPicked(null)} aria-label="Remove">×</button>
            </div>
          ) : (
            <>
              <input
                className="it-sheet-input"
                placeholder="Customer, prospect, or any name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {matches.map((a) => (
                <button key={`${a.type}-${a.id}`} className="it-match" onClick={() => setPicked(a)}>
                  <span className="it-match-name">{a.name}</span>
                  <span className="it-match-sub">
                    {a.type === 'prospect' ? 'Prospect' : 'Customer'}
                    {a.address ? ` · ${a.address}` : ''}
                  </span>
                </button>
              ))}
            </>
          )}
          <label className="it-sheet-row">
            <span>Time</span>
            <select className="it-sheet-select" value={time} onChange={(e) => setTime(Number(e.target.value))}>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="it-sheet-note">
          Repeating visits come from a prospect's visit schedule (Edit › Visit schedule).
        </div>
      </div>
    </div>
  );
}

export default ItineraryPage;
