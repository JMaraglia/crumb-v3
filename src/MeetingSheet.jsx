// file: src/MeetingSheet.jsx
// "Meeting" button on an account's notes (and on an Itinerary stop): pick a day and time, and it's saved
// as a calendar event linked to the account, so it shows on the Calendar AND that day's Itinerary.
import React, { useState } from 'react';
import { TIME_OPTIONS, timeLabel } from './AccountViews';
import { keyOf, addDaysToKey, fromKey, MEETING_COLOR } from './schedule';
import { loadEvents, saveEvents, loadCalendarSettings, stampOf } from './store';
import './MeetingSheet.css';

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
// existing: a Meeting note's `meeting` ({ date, start, eventId }) → change that meeting instead of adding one.
export default function MeetingSheet({ account, presetNotes = '', existing = null, onSaved, onCancel }) {
  const settings = loadCalendarSettings();
  const allEvents = loadEvents();
  const oldEvent =
    existing ? allEvents.find((ev) => String(ev.id) === String(existing.eventId)) || null : null;
  const oldLength = oldEvent && typeof oldEvent.end === 'number' ? oldEvent.end - oldEvent.start : null;
  const [day, setDay] = useState((existing && existing.date) || addDaysToKey(keyOf(new Date()), 1));
  const [start, setStart] = useState(existing && typeof existing.start === 'number' ? existing.start : 12 * 60);
  const [length, setLength] = useState(
    LENGTHS.some(([m]) => m === oldLength) ? oldLength : LENGTHS.some(([m]) => m === settings.eventLength) ? settings.eventLength : 60
  );
  const [title, setTitle] = useState((oldEvent && oldEvent.title) || `Meeting · ${account.name || ''}`.trim());
  const [notes, setNotes] = useState(oldEvent ? oldEvent.notes || '' : presetNotes);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day);

  const save = () => {
    if (!valid) return;
    const list = loadEvents();
    const event = {
      ...(oldEvent || {}),
      id: oldEvent ? oldEvent.id : Date.now(),
      title: title.trim() || 'Meeting',
      date: day,
      start,
      end: Math.min(start + length, 1440),
      location: oldEvent ? oldEvent.location || '' : account.address || '',
      notes: notes.trim(),
      // meetings are orange (an old meeting left on the default blue turns orange when changed)
      color: oldEvent && oldEvent.color && oldEvent.color !== (settings.defaultColor || '#0077cc') ? oldEvent.color : MEETING_COLOR,
      meeting: true,
      accountType: account.type,
      accountId: account.id,
      accountName: account.name || null,
      showInItinerary: true,
    };
    // Changing a meeting replaces its calendar event (or re-adds it if it was deleted from the Calendar).
    const others = oldEvent ? list.filter((ev) => String(ev.id) !== String(oldEvent.id)) : list;
    saveEvents([...others, event]);
    if (existing) {
      onSaved(`Meeting changed: ${niceMeeting(day, start)}`, null, { date: day, start, eventId: event.id });
      return;
    }
    // Also hand back a "Meeting" note for the account's notes (same as any other label).
    const note = {
      text: notes.trim() || `Meeting ${niceMeeting(day, start)}`,
      category: 'Meeting',
      timestamp: stampOf(),
      meeting: { date: day, start, eventId: event.id },
    };
    onSaved(`Meeting added to Calendar and Daily Stops: ${niceMeeting(day, start)}`, note);
  };

  return (
    <div className="mt-backdrop" onClick={onCancel}>
      <div className="mt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mt-top">
          <button className="mt-link" onClick={onCancel}>Cancel</button>
          <div className="mt-title">{existing ? 'Change meeting' : 'Set a meeting'}</div>
          <button className="mt-link mt-bold" disabled={!valid} onClick={save}>Save</button>
        </div>
        <div className="mt-who">
          <strong>{account.name}</strong>
          <span>Goes on the Calendar and that day's Daily Stops, with a reminder before it.</span>
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
