// file: src/EventSheet.jsx
// The add/edit panel that slides up from the bottom (Google Calendar style).
// Times are 30-minute steps only. Stores minutes-from-midnight (e.g. 9:30 AM = 570).
import React, { useState } from 'react';
import { shareFile, eventIcs, safeFileName } from './share';
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

export default function EventSheet({
  draft,
  isNew,
  onSave,
  onDelete,
  onCancel,
  existingEvents = [],
  accounts = [], // customers + prospects: { type, id, name, address }
  colorNames = {}, // { '#34c759': 'Prospect meeting' } from Calendar settings
}) {
  const [title, setTitle] = useState(draft.title || '');
  const [date, setDate] = useState(draft.date);
  const [start, setStart] = useState(draft.start);
  const [end, setEnd] = useState(draft.end);
  const [location, setLocation] = useState(draft.location || '');
  const [notes, setNotes] = useState(draft.notes || '');
  const [color, setColor] = useState(draft.color || DEFAULT_EVENT_COLOR);
  const [inviteMsg, setInviteMsg] = useState('');

  // Linked customer/prospect. Picking one fills in the location with their address.
  const [account, setAccount] = useState(
    draft.accountId ? { type: draft.accountType, id: draft.accountId, name: draft.accountName } : null
  );
  const [accountSearch, setAccountSearch] = useState('');
  // Itinerary: linked events show by default; others only if switched on.
  const [showInItinerary, setShowInItinerary] = useState(
    typeof draft.showInItinerary === 'boolean' ? draft.showInItinerary : Boolean(draft.accountId)
  );
  const [itineraryTouched, setItineraryTouched] = useState(typeof draft.showInItinerary === 'boolean');
  const accountMatches = accountSearch.trim()
    ? accounts
        .filter((a) => a.name && a.name.toLowerCase().includes(accountSearch.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  const pickAccount = (a) => {
    setAccount({ type: a.type, id: a.id, name: a.name });
    if (!itineraryTouched) setShowInItinerary(true);
    setAccountSearch('');
    if (a.address) setLocation(a.address);
    if (!title.trim()) setTitle(a.name);
  };

  const endOptions = [];
  for (let t = start + STEP; t <= 1440; t += STEP) endOptions.push(t);

  const changeStart = (value) => {
    const newStart = Number(value);
    const length = end - start; // keep the same event length when moving start
    setConflicts([]);
    setStart(newStart);
    setEnd(Math.min(newStart + Math.max(length, STEP), 1440));
  };

  // Double-booking warning: other events on the same day whose times overlap.
  const [conflicts, setConflicts] = useState([]);
  const findConflicts = () =>
    existingEvents
      .filter((ev) => ev.id !== draft.id && ev.date === date && ev.start < end && start < ev.end)
      .sort((a, b) => a.start - b.start);

  const handleSave = (confirmed = false) => {
    if (!confirmed) {
      const overlapping = findConflicts();
      if (overlapping.length) {
        setConflicts(overlapping);
        return;
      }
    }
    onSave({
      ...draft,
      title: title.trim() || '(No title)',
      date,
      start,
      end,
      location: location.trim(),
      notes: notes.trim(),
      color,
      accountType: account ? account.type : null,
      accountId: account ? account.id : null,
      accountName: account ? account.name : null,
      showInItinerary,
    });
  };

  return (
    <div className="es-backdrop" onClick={onCancel}>
      <div className="es-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="es-grabber" />

        <div className="es-topbar">
          <button className="es-text-btn" onClick={onCancel}>Cancel</button>
          <div className="es-heading">{isNew ? 'New Event' : 'Edit Event'}</div>
          <button className="es-save-btn" onClick={() => handleSave(false)}>Save</button>
        </div>

        {conflicts.length > 0 && (
          <div className="es-warning">
            <div className="es-warning-title">Heads up — you're already booked</div>
            {conflicts.map((ev) => (
              <div key={ev.id} className="es-warning-item">
                <span className="es-warning-dot" style={{ backgroundColor: ev.color }} />
                {ev.title}, {timeLabel(ev.start)} – {timeLabel(ev.end)}
              </div>
            ))}
            <div className="es-warning-actions">
              <button className="es-warning-change" onClick={() => setConflicts([])}>Change time</button>
              <button className="es-warning-save" onClick={() => handleSave(true)}>Save anyway</button>
            </div>
          </div>
        )}

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
              onChange={(e) => { if (e.target.value) { setConflicts([]); setDate(e.target.value); } }}
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
            <select className="es-input" value={end} onChange={(e) => { setConflicts([]); setEnd(Number(e.target.value)); }}>
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
              aria-label={colorNames[c.value] || c.name}
            />
          ))}
          {(() => {
            const picked = EVENT_COLORS.find((c) => c.value === color);
            const named = colorNames[color];
            return picked ? (
              <div className="es-color-name">
                <span className="es-color-dot" style={{ backgroundColor: color }} />
                {named ? `${named}` : picked.name}
                {named && <span className="es-color-sub"> · {picked.name}</span>}
              </div>
            ) : null;
          })()}
        </div>

        <div className="es-group">
          {account ? (
            <div className="es-account-chip">
              <span className="es-account-name">{account.name}</span>
              <span className="es-account-type">{account.type === 'prospect' ? 'Prospect' : 'Customer'}</span>
              <button type="button" className="es-account-clear" onClick={() => setAccount(null)} aria-label="Remove">
                ×
              </button>
            </div>
          ) : (
            <div className="es-account-search">
              <input
                className="es-input es-full"
                placeholder="Customer or prospect"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
              />
              {accountMatches.length > 0 && (
                <div className="es-account-list">
                  {accountMatches.map((a) => (
                    <button
                      type="button"
                      key={`${a.type}-${a.id}`}
                      className="es-account-option"
                      onClick={() => pickAccount(a)}
                    >
                      <span className="es-account-option-name">{a.name}</span>
                      <span className="es-account-option-detail">
                        {a.type === 'prospect' ? 'Prospect' : 'Customer'}
                        {a.address ? ` · ${a.address}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {accountSearch.trim() && accountMatches.length === 0 && (
                <div className="es-account-none">No matching customers or prospects</div>
              )}
            </div>
          )}
          <input
            className="es-input es-full"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <label className="es-row es-switch-row">
            <span className="es-label">Show in itinerary</span>
            <input
              type="checkbox"
              className="es-switch"
              checked={showInItinerary}
              onChange={(e) => {
                setItineraryTouched(true);
                setShowInItinerary(e.target.checked);
              }}
            />
          </label>
          {location.trim() && (
            <div className="es-maps">
              <span className="es-maps-label">Directions:</span>
              <a
                className="es-maps-link"
                href={`https://maps.apple.com/?q=${encodeURIComponent(location.trim())}`}
                target="_blank"
                rel="noreferrer"
              >
                Apple Maps
              </a>
              <a
                className="es-maps-link"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`}
                target="_blank"
                rel="noreferrer"
              >
                Google Maps
              </a>
            </div>
          )}
          <textarea
            className="es-input es-full es-notes"
            placeholder="Notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Send this appointment so someone else can add it to their calendar (uses what's on screen) */}
        <button
          className="es-invite-btn"
          disabled={!title.trim()}
          onClick={async () =>
            setInviteMsg(
              await shareFile(
                eventIcs({ title: title.trim(), date, start, end, location: location.trim(), notes: notes.trim() }),
                `${safeFileName(title.trim())}.ics`,
                title.trim()
              )
            )
          }
        >
          Send as calendar invite
        </button>
        {inviteMsg && <div className="es-invite-msg">{inviteMsg}</div>}

        {!isNew && (
          <button className="es-delete-btn" onClick={() => onDelete(draft.id)}>
            Delete Event
          </button>
        )}
      </div>
    </div>
  );
}
