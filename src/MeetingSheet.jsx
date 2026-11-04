// file: src/MeetingSheet.jsx
// "Meeting" button on an account's notes (and on an Itinerary stop): pick a day and time, and it's saved
// as a calendar event linked to the account, so it shows on the Calendar AND that day's Itinerary.
import React, { useState } from 'react';
import { TIME_OPTIONS, timeLabel } from './AccountViews';
import { keyOf, addDaysToKey, fromKey, readJSON } from './schedule';
import './MeetingSheet.css';

const EVENTS_KEY = 'crumb_calendar_events';
const LENGTHS = [
  [30, '30 min'],
  [60, '1 hour'],
  [90, '1.5 hours'],
  [120, '2 hours'],
];

export function niceMeeting(dateKey, start) {
  return `${fromKey(dateKey).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${timeLabel(start)}`;
}

// account: { type: 'customer' | 'prospect', id, name, address }
export default function MeetingSheet({ account, presetNotes = '', onSaved, onCancel }) {
  const settings = readJSON('crumb_calendar_settings', {}) || {};
  const [day, setDay] = useState(addDaysToKey(keyOf(new Date()), 1));
  const [start, setStart] = useState(12 * 60);
  const [length, setLength] = useState(LENGTHS.some(([m]) => m === settings.eventLength) ? settings.eventLength : 60);
  const [title, setTitle] = useState(`Meeting · ${account.name || ''}`.trim());
  const [notes, setNotes] = useState(presetNotes);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day);

  const save = () => {
    if (!valid) return;
    const events = readJSON(EVENTS_KEY, []);
    const list = Array.isArray(events) ? events : [];
    const event = {
      id: Date.now(),
      title: title.trim() || 'Meeting',
      date: day,
      start,
      end: Math.min(start + length, 1440),
      location: account.address || '',
      notes: notes.trim(),
      color: settings.defaultColor || '#0077cc',
      accountType: account.type,
      accountId: account.id,
      accountName: account.name || null,
      showInItinerary: true,
    };
    localStorage.setItem(EVENTS_KEY, JSON.stringify([...list, event]));
    onSaved(`Meeting added to Calendar and Itinerary: ${niceMeeting(day, start)}`);
  };

  return (
    <div className="mt-backdrop" onClick={onCancel}>
      <div className="mt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mt-top">
          <button className="mt-link" onClick={onCancel}>Cancel</button>
          <div className="mt-title">Set a meeting</div>
          <button className="mt-link mt-bold" disabled={!valid} onClick={save}>Save</button>
        </div>
        <div className="mt-who">
          <strong>{account.name}</strong>
          <span>Goes on the Calendar and that day's Itinerary, with a reminder before it.</span>
        </div>
        <div className="mt-group">
          <label className="mt-row">
            <span>Day</span>
            <input type="date" className="mt-input mt-date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="mt-row">
            <span>Time</span>
            <select className="mt-input" value={start} onChange={(e) => setStart(Number(e.target.value))}>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
          <label className="mt-row">
            <span>Length</span>
            <select className="mt-input" value={length} onChange={(e) => setLength(Number(e.target.value))}>
              {LENGTHS.map(([m, l]) => (
                <option key={m} value={m}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-group">
          <input className="mt-full" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="mt-full mt-notes" rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
