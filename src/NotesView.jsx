// file: src/NotesView.jsx
// One notes screen used by both customer notes and prospect notes.
// Each account still keeps its own notes; only the layout is shared.
// A note looks like: { text, category, timestamp, done? }  (done is for Follow-ups and Samples)
import React, { useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline } from 'react-icons/io5';
import { shareText, shareFile, safeFileName } from './share';
import { buildNotesPdf } from './notesPdf';
import { useNavigate } from 'react-router-dom';
import { isCheckable, isNoteDone } from './noteStatus';
import MeetingSheet, { niceMeeting } from './MeetingSheet';
import SwipeRow from './SwipeRow';
import './NotesView.css';

export const NOTE_CATEGORIES = ['General', 'Visit', 'Sample', 'Follow-up', 'Contacted', 'Background', 'Meeting'];
// Labels you can pick. A note with no label is saved as 'General' and shows no tag.
// (Meeting is picked with the Meeting button, which also books it on the Calendar.)
// Contacted = touched the account without a visit (email, text, call).
const LABELS = ['Visit', 'Sample', 'Follow-up', 'Contacted', 'Background'];

const CATEGORY_COLORS = {
  General: { bg: '#eeeef0', fg: '#3a3a3c' },
  Visit: { bg: '#e6f1fa', fg: '#0077cc' },
  Sample: { bg: '#e3f6e8', fg: '#1e8e3e' },
  'Follow-up': { bg: '#fff1de', fg: '#b25e00' },
  Contacted: { bg: '#e0f4f6', fg: '#0e7c86' },
  Background: { bg: '#f3e8fb', fg: '#8a3fb5' },
  Meeting: { bg: '#fff1e0', fg: '#d96b00' },
};

// Older notes used "Follow-Up"; treat it the same as "Follow-up".
export function normalizeCategory(cat) {
  if (!cat) return 'General';
  if (cat.toLowerCase() === 'follow-up') return 'Follow-up';
  return cat;
}

export function categoryStyle(cat) {
  return CATEGORY_COLORS[normalizeCategory(cat)] || { bg: '#eeeef0', fg: '#3a3a3c' };
}

// "Tue, Nov 3 · 2:40 PM" (falls back to whatever was saved if it can't be read)
// Note time ⇄ the date-and-time box on the edit screen ('YYYY-MM-DDTHH:MM', local time)
function toWhen(timestamp) {
  const t = Date.parse(timestamp);
  if (!t) return '';
  const d = new Date(t);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function noteDate(timestamp) {
  const t = Date.parse(timestamp);
  if (!t) return timestamp || '';
  const d = new Date(t);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function CategoryChips({ value, onChange, extra = null, labels = LABELS }) {
  return (
    <div className="nv-cats">
      {labels.map((c) => {
        const on = normalizeCategory(value) === c;
        const st = categoryStyle(c);
        return (
          <button
            key={c}
            type="button"
            className={`nv-cat ${on ? 'is-on' : ''}`}
            style={on ? { background: st.fg, color: '#fff' } : { background: st.bg, color: st.fg }}
            onClick={() => onChange(on ? 'General' : c)}  // tap again to remove the label
          >
            {c}
          </button>
        );
      })}
      {extra}
    </div>
  );
}

// Due date for a Follow-up / Sample note: Today, Tomorrow, or pick a date (tap again to clear).
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n) => {
  const d = new Date();
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
export function dueLabel(k) {
  if (!k) return '';
  if (k === plusDays(0)) return 'Today';
  if (k === plusDays(1)) return 'Tomorrow';
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function DueChips({ value, onChange }) {
  const today = plusDays(0);
  const tomorrow = plusDays(1);
  const picked = value && value !== today && value !== tomorrow;
  return (
    <div className="nv-cats nv-due-row">
      <span className="nv-cats-label">Due:</span>
      <button type="button" className={`nv-due-chip ${value === today ? 'is-on' : ''}`} onClick={() => onChange(value === today ? null : today)}>
        Today
      </button>
      <button type="button" className={`nv-due-chip ${value === tomorrow ? 'is-on' : ''}`} onClick={() => onChange(value === tomorrow ? null : tomorrow)}>
        Tomorrow
      </button>
      <label className={`nv-due-chip ${picked ? 'is-on' : ''}`}>
        {picked ? dueLabel(value) : 'Pick date'}
        <input type="date" className="nv-due-input" value={value || ''} onChange={(e) => onChange(e.target.value || null)} />
      </label>
    </div>
  );
}

export default function NotesView({ account, kindLabel, goBack, onAddNote, onDeleteNote }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [category, setCategory] = useState('General');
  const [due, setDue] = useState(null); // due date for a new Follow-up / Sample
  const [filter, setFilter] = useState('All');
  const [editing, setEditing] = useState(null); // { index, text, category }
  const [shareMsg, setShareMsg] = useState('');
  const [meeting, setMeeting] = useState(false); // "Set a meeting" panel open
  const [changingMeeting, setChangingMeeting] = useState(null); // index of a Meeting note whose time is being changed

  const notes = (account.notes || []).map((n, index) => ({ ...n, index, cat: normalizeCategory(n.category) }));
  const byNewest = (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0) || b.index - a.index;
  const background = notes.filter((n) => n.cat === 'Background').sort(byNewest);
  const others = notes.filter((n) => n.cat !== 'Background').sort(byNewest);
  const openFollowUps = others.filter((n) => n.cat === 'Follow-up' && !n.done).length;

  const shown =
    filter === 'All'
      ? others
      : filter === 'Open follow-ups'
      ? others.filter((n) => n.cat === 'Follow-up' && !n.done)
      : notes.filter((n) => n.cat === filter).sort(byNewest);

  // Filter chips: All, open follow-ups (if any), plus every category in use.
  const usedCats = Array.from(new Set(notes.map((n) => n.cat))).sort((a, b) => {
    const ia = NOTE_CATEGORIES.indexOf(a);
    const ib = NOTE_CATEGORIES.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const filterChips = ['All', ...(openFollowUps ? ['Open follow-ups'] : []), ...usedCats.filter((c) => c !== 'General')];

  // Back goes to wherever you came from (the account), like the iPhone gesture.
  const back = () => {
    const idx = window.history.state && window.history.state.idx;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else goBack();
  };

  const add = () => {
    if (!text.trim()) return;
    const note = { text: text.trim(), category, timestamp: new Date().toLocaleString() };
    if (isCheckable(category)) {
      note.done = false; // Follow-ups and Samples get a checkbox
      if (due) note.due = due; // shows on the To-Do list with this date
    }
    onAddNote(account.id, note);
    setText('');
    setCategory('General');
    setDue(null);
  };

  const toggleDone = (n) => {
    const { index, cat, ...saved } = n;
    onAddNote(account.id, { ...saved, done: !isNoteDone(n) }, index);
  };

  const saveEdit = () => {
    if (!editing.text.trim()) return;
    const original = account.notes[editing.index];
    const updated = { ...original, text: editing.text.trim(), category: editing.category };
    // Changed the date/time (e.g. a note from yesterday typed in today)
    if (editing.when && editing.when !== editing.when0) {
      const t = new Date(editing.when);
      if (!Number.isNaN(t.getTime())) updated.timestamp = t.toLocaleString();
    }
    if (isCheckable(editing.category)) {
      if (editing.due) updated.due = editing.due;
      else delete updated.due;
    }
    // Switched to Follow-up / Sample: starts unchecked (an existing old Sample keeps its state)
    if (isCheckable(editing.category) && normalizeCategory(original.category) !== editing.category) updated.done = false;
    onAddNote(account.id, updated, editing.index);
    setEditing(null);
  };

  // Share one note as text: "Charred Oak Tavern — Tue, Nov 3 · 2:40 PM (Visit)" + the note
  const shareNote = async (n, textNow, catNow) => {
    const cat = catNow && catNow !== 'General' ? ` (${catNow})` : '';
    const msg = `${account.name || 'Note'} — ${noteDate(n.timestamp)}${cat}\n${textNow}`;
    setShareMsg(await shareText(`${account.name || 'Crumb'} note`, msg));
  };

  // Share this account's notes (what's on screen: Background + the current filter) as a PDF
  const shareAll = async () => {
    const list = [...background, ...(filter === 'Background' ? [] : shown)];
    const seen = new Set();
    const items = list
      .filter((n) => !seen.has(n.index) && seen.add(n.index))
      .map((n) => ({
        ...n,
        time: Date.parse(n.timestamp) || 0,
        accountName: account.name || '',
        kind: (kindLabel || '').toLowerCase() === 'prospect' ? 'prospect' : 'customer',
      }))
      .sort((a, b) => b.time - a.time);
    const groups = [];
    items.forEach((n) => {
      const label = n.time
        ? new Date(n.time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : 'No date';
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, notes: [] });
      groups[groups.length - 1].notes.push(n);
    });
    const whenText = (n) => (n.time ? new Date(n.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
    const heading = `${account.name || 'Notes'}${filter !== 'All' ? ` · ${filter}` : ''}`;
    const blob = buildNotesPdf({ heading, groups, groupSide: () => '', whenText, showAccount: false });
    setShareMsg(await shareFile(blob, `${safeFileName(account.name)} notes.pdf`, `${account.name} notes`));
  };

  const remove = (index) => {
    if (!window.confirm('Delete this note?')) return;
    onDeleteNote(index);
    setEditing(null);
  };

  // Swipe a note left → asks, then deletes it for good.
  const swipeDelete = (index) => {
    if (!window.confirm("Delete this note permanently?\n\nIt can't be undone.")) return;
    onDeleteNote(index);
    if (editing && editing.index === index) setEditing(null);
  };

  const renderNote = (n) => {
    if (editing && editing.index === n.index) {
      return (
        <div key={n.index} className="nv-note nv-note-editing">
          <textarea
            className="nv-textarea"
            rows={3}
            value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            autoFocus
          />
          <CategoryChips
            value={editing.category}
            onChange={(c) => setEditing({ ...editing, category: c })}
            labels={[...LABELS, 'Meeting']}
          />
          {isCheckable(editing.category) && (
            <DueChips value={editing.due} onChange={(d) => setEditing({ ...editing, due: d })} />
          )}
          {editing.when0 && (
            <label className="nv-when-row">
              <span>Date</span>
              <input
                type="datetime-local"
                className="nv-when-input"
                value={editing.when}
                onChange={(e) => setEditing({ ...editing, when: e.target.value })}
              />
            </label>
          )}
          <div className="nv-edit-actions">
            <button className="nv-btn-delete" onClick={() => remove(n.index)}>Delete</button>
            <button className="nv-btn-share" onClick={() => shareNote(n, editing.text.trim(), editing.category)}>
              Share
            </button>
            <span className="nv-spacer" />
            <button className="nv-btn-plain" onClick={() => setEditing(null)}>Cancel</button>
            <button className="nv-btn-primary" onClick={saveEdit}>Save</button>
          </div>
        </div>
      );
    }
    const st = categoryStyle(n.cat);
    const hasCheck = isCheckable(n.cat);
    const isDone = hasCheck && isNoteDone(n);
    return (
      <SwipeRow key={n.index} className={`nv-note ${isDone ? 'is-done' : ''}`} onDelete={() => swipeDelete(n.index)}>
        {hasCheck && (
          <button
            className={`nv-check ${isDone ? 'is-checked' : ''}`}
            onClick={() => toggleDone(n)}
            aria-label={isDone ? 'Mark not done' : 'Mark done'}
          >
            {isDone ? '✓' : ''}
          </button>
        )}
        <button
          className="nv-note-body"
          onClick={() => setEditing({ index: n.index, text: n.text, category: n.cat, due: n.due || null, when: toWhen(n.timestamp), when0: toWhen(n.timestamp) })}
        >
          <span className="nv-note-meta">
            {n.cat !== 'General' && (
              <span className="nv-tag" style={{ background: st.bg, color: st.fg }}>{n.cat}</span>
            )}
            <span className="nv-date">{noteDate(n.timestamp)}</span>
            {n.meeting && n.meeting.date && (
              <span
                className="nv-meeting-when"
                role="button"
                onClick={(e) => {
                  e.stopPropagation(); // tapping the meeting time changes the meeting, not the note
                  setChangingMeeting(n.index);
                }}
              >
                {niceMeeting(n.meeting.date, n.meeting.start)}
              </span>
            )}
            {hasCheck && n.due && !isDone && (
              <span className={`nv-due ${n.due < plusDays(0) ? 'is-late' : ''}`}>Due {dueLabel(n.due)}</span>
            )}
          </span>
          <span className="nv-note-text">{n.text}</span>
        </button>
      </SwipeRow>
    );
  };

  return (
    <div className="nv-page">
      <header className="nv-header">
        <button className="nv-icon-btn" onClick={back} aria-label="Back">
          <FaArrowLeft />
        </button>
        <div className="nv-header-text">
          <div className="nv-header-title">{account.name || 'Notes'}</div>
          <div className="nv-header-sub">{kindLabel} notes</div>
        </div>
        {notes.length > 0 ? (
          <button className="nv-icon-btn nv-share-btn" onClick={shareAll} aria-label="Share these notes as a PDF">
            <IoShareOutline />
          </button>
        ) : (
          <span className="nv-header-right" />
        )}
      </header>
      {shareMsg && <div className="nv-share-msg">{shareMsg}</div>}

      <div className="nv-content">
        {/* Background notes stay pinned at the top */}
        {background.length > 0 && (
          <div className="nv-pinned">
            <div className="nv-pinned-title">Background</div>
            {background.map((n) =>
              editing && editing.index === n.index ? (
                renderNote(n)
              ) : (
                <button
                  key={n.index}
                  className="nv-pinned-item"
                  onClick={() => setEditing({ index: n.index, text: n.text, category: n.cat, due: n.due || null, when: toWhen(n.timestamp), when0: toWhen(n.timestamp) })}
                >
                  {n.text}
                </button>
              )
            )}
          </div>
        )}

        {/* New note */}
        <div className="nv-compose">
          <textarea
            className="nv-textarea"
            rows={3}
            placeholder="Write a note…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <CategoryChips
            value={category}
            onChange={setCategory}
            extra={
              <button type="button" className="nv-cat nv-cat-meeting" onClick={() => setMeeting(true)}>
                Meeting
              </button>
            }
          />
          {isCheckable(category) && <DueChips value={due} onChange={setDue} />}
          <div className="nv-compose-actions">
            <span className="nv-spacer" />
            <button className="nv-btn-primary" disabled={!text.trim()} onClick={add}>
              Add note
            </button>
          </div>
        </div>

        {/* Filters */}
        {notes.length > 0 && (
          <div className="nv-filters">
            {filterChips.map((f) => (
              <button key={f} className={`nv-filter ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)}>
                {f}
                {f === 'Open follow-ups' ? ` (${openFollowUps})` : ''}
              </button>
            ))}
          </div>
        )}

        {/* Notes, newest first */}
        {notes.length === 0 ? (
          <div className="nv-empty">No notes yet.</div>
        ) : shown.length === 0 ? (
          <div className="nv-empty">Nothing here.</div>
        ) : (
          <div className="nv-list">{shown.map(renderNote)}</div>
        )}
        {notes.length > 0 && <div className="nv-hint">Tap a note to edit or share it · Swipe left to delete</div>}
      </div>
      {changingMeeting != null && account.notes[changingMeeting] && (
        <MeetingSheet
          account={{
            type: (kindLabel || '').toLowerCase() === 'prospect' ? 'prospect' : 'customer',
            id: account.id,
            name: account.name,
            address: account.address,
          }}
          existing={account.notes[changingMeeting].meeting}
          onCancel={() => setChangingMeeting(null)}
          onSaved={(msg, _note, meetingInfo) => {
            const original = account.notes[changingMeeting];
            onAddNote(account.id, { ...original, meeting: meetingInfo }, changingMeeting);
            setChangingMeeting(null);
            setShareMsg(msg);
          }}
        />
      )}

      {meeting && (
        <MeetingSheet
          account={{
            type: (kindLabel || '').toLowerCase() === 'prospect' ? 'prospect' : 'customer',
            id: account.id,
            name: account.name,
            address: account.address,
          }}
          presetNotes={text.trim()}
          onCancel={() => setMeeting(false)}
          onSaved={(msg, note) => {
            setMeeting(false);
            setShareMsg(msg);
            onAddNote(account.id, note); // saved as a "Meeting" note, like any other label
            setText('');
            setCategory('General');
            setDue(null);
          }}
        />
      )}
    </div>
  );
}
