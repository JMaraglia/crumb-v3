// file: src/EventSheet.jsx
// The add/edit panel that slides up from the bottom (Google Calendar style).
// Times are 30-minute steps only. Stores minutes-from-midnight (e.g. 9:30 AM = 570).
import React, { useState } from 'react';
import './EventSheet.css';

const STEP = 30;

function timeLabel(minutes) {
  if (minutes >= 1440) return '12:00 AM (next day)';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m === 0 ? '00' : m} ${h < 12 ? 'AM' : 'PM'}`;
}

const START_OPTIONS = Array.from({ length: 48 }, (_, i) => i * STEP); // 12:00 AM – 11:30 PM

// 12 event colors. The first one is the default.
export const EVENT_COLORS = [
  { name: 'Blue', value: '#0077cc' },
  { name: 'Red', value: '#ff3b30' },
  { name: 'Orange', value: '#ff9500' },
  { name: 'Yellow', value: '#ffcc00' },
  { name: 'Green', value: '#34c759' },
  { name: 'Mint', value: '#00c7be' },
  { name: 'Teal', value: '#30b0c7' },
  { name: 'Indigo', value: '#5856d6' },
  { name: 'Purple', value: '#af52de' },
  { name: 'Pink', value: '#ff2d55' },
  { name: 'Brown', value: '#a2845e' },
  { name: 'Gray', value: '#8e8e93' },
];
export const DEFAULT_EVENT_COLOR = EVENT_COLORS[0].value;

export default function EventSheet({ draft, isNew, onSave, onDelete, onCancel }) {
  const [title, setTitle] = useState(draft.title || '');
  const [date, setDate] = useState(draft.date);
  const [start, setStart] = useState(draft.start);
  const [end, setEnd] = useState(draft.end);
  const [location, setLocation] = useState(draft.location || '');
  const [notes, setNotes] = useState(draft.notes || '');
  const [color, setColor] = useState(draft.color || DEFAULT_EVENT_COLOR);

  const endOptions = [];
  for (let t = start + STEP; t <= 1440; t += STEP) endOptions.push(t);

  const changeStart = (value) => {
    const newStart = Number(value);
    const length = end - start; // keep the same event length when moving start
    setStart(newStart);
    setEnd(Math.min(newStart + Math.max(length, STEP), 1440));
  };

  const handleSave = () => {
    onSave({
      ...draft,
      title: title.trim() || '(No title)',
      date,
      start,
      end,
      location: location.trim(),
      notes: notes.trim(),
      color,
    });
  };

  return (
    <div className="es-backdrop" onClick={onCancel}>
      <div className="es-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="es-grabber" />

        <div className="es-topbar">
          <button className="es-text-btn" onClick={onCancel}>Cancel</button>
          <div className="es-heading">{isNew ? 'New Event' : 'Edit Event'}</div>
          <button className="es-save-btn" onClick={handleSave}>Save</button>
        </div>

        <input
          className="es-title"
          placeholder="Add title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={isNew}
        />

        <div className="es-group">
          <label className="es-row">
            <span className="es-label">Date</span>
            <input
              type="date"
              className="es-input"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </label>
          <label className="es-row">
            <span className="es-label">Starts</span>
            <select className="es-input" value={start} onChange={(e) => changeStart(e.target.value)}>
              {START_OPTIONS.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
          <label className="es-row">
            <span className="es-label">Ends</span>
            <select className="es-input" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
              {endOptions.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="es-group es-colors">
          {EVENT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`es-swatch ${c.value === color ? 'is-picked' : ''}`}
              style={{ backgroundColor: c.value }}
              onClick={() => setColor(c.value)}
              aria-label={c.name}
            />
          ))}
        </div>

        <div className="es-group">
          <input
            className="es-input es-full"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <textarea
            className="es-input es-full es-notes"
            placeholder="Notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {!isNew && (
          <button className="es-delete-btn" onClick={() => onDelete(draft.id)}>
            Delete Event
          </button>
        )}
      </div>
    </div>
  );
}
