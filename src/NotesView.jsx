// file: src/NotesView.jsx
// One notes screen used by both customer notes and prospect notes.
// Each account still keeps its own notes; only the layout is shared.
// A note looks like: { text, category, timestamp, done? }  (done is for Follow-ups)
import React, { useState } from 'react';
import { FaArrowLeft, FaMicrophone } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './NotesView.css';

export const NOTE_CATEGORIES = ['General', 'Visit', 'Sample', 'Follow-up', 'Background'];

const CATEGORY_COLORS = {
  General: { bg: '#eeeef0', fg: '#3a3a3c' },
  Visit: { bg: '#e6f1fa', fg: '#0077cc' },
  Sample: { bg: '#e3f6e8', fg: '#1e8e3e' },
  'Follow-up': { bg: '#fff1de', fg: '#b25e00' },
  Background: { bg: '#f3e8fb', fg: '#8a3fb5' },
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
export function noteDate(timestamp) {
  const t = Date.parse(timestamp);
  if (!t) return timestamp || '';
  const d = new Date(t);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

const speechSupported = typeof window !== 'undefined' && 'webkitSpeechRecognition' in window;

// Talk-to-type button. Adds what you say to the text box.
function MicButton({ onText }) {
  const [listening, setListening] = useState(false);
  const [rec, setRec] = useState(null);
  if (!speechSupported) return null;

  const toggle = () => {
    if (listening && rec) {
      rec.stop();
      return;
    }
    const r = new window.webkitSpeechRecognition();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-US';
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    setRec(r);
    setListening(true);
  };

  return (
    <button type="button" className={`nv-mic ${listening ? 'is-on' : ''}`} onClick={toggle} aria-label="Talk to type">
      <FaMicrophone />
      <span>{listening ? 'Listening…' : 'Talk'}</span>
    </button>
  );
}

function CategoryChips({ value, onChange }) {
  return (
    <div className="nv-cats">
      {NOTE_CATEGORIES.map((c) => {
        const on = normalizeCategory(value) === c;
        const st = categoryStyle(c);
        return (
          <button
            key={c}
            type="button"
            className={`nv-cat ${on ? 'is-on' : ''}`}
            style={on ? { background: st.fg, color: '#fff' } : { background: st.bg, color: st.fg }}
            onClick={() => onChange(c)}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

export default function NotesView({ account, kindLabel, goBack, onAddNote, onDeleteNote }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [category, setCategory] = useState('General');
  const [filter, setFilter] = useState('All');
  const [editing, setEditing] = useState(null); // { index, text, category }

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
  const filterChips = ['All', ...(openFollowUps ? ['Open follow-ups'] : []), ...usedCats];

  // Back goes to wherever you came from (the account), like the iPhone gesture.
  const back = () => {
    const idx = window.history.state && window.history.state.idx;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else goBack();
  };

  const add = () => {
    if (!text.trim()) return;
    const note = { text: text.trim(), category, timestamp: new Date().toLocaleString() };
    if (category === 'Follow-up') note.done = false;
    onAddNote(account.id, note);
    setText('');
    setCategory('General');
  };

  const toggleDone = (n) => {
    const { index, cat, ...saved } = n;
    onAddNote(account.id, { ...saved, done: !n.done }, index);
  };

  const saveEdit = () => {
    if (!editing.text.trim()) return;
    const original = account.notes[editing.index];
    const updated = { ...original, text: editing.text.trim(), category: editing.category };
    if (editing.category === 'Follow-up' && typeof updated.done !== 'boolean') updated.done = false;
    onAddNote(account.id, updated, editing.index);
    setEditing(null);
  };

  const remove = (index) => {
    if (!window.confirm('Delete this note?')) return;
    onDeleteNote(index);
    setEditing(null);
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
          <CategoryChips value={editing.category} onChange={(c) => setEditing({ ...editing, category: c })} />
          <div className="nv-edit-actions">
            <button className="nv-btn-delete" onClick={() => remove(n.index)}>Delete</button>
            <span className="nv-spacer" />
            <button className="nv-btn-plain" onClick={() => setEditing(null)}>Cancel</button>
            <button className="nv-btn-primary" onClick={saveEdit}>Save</button>
          </div>
        </div>
      );
    }
    const st = categoryStyle(n.cat);
    const isFollowUp = n.cat === 'Follow-up';
    return (
      <div key={n.index} className={`nv-note ${isFollowUp && n.done ? 'is-done' : ''}`}>
        {isFollowUp && (
          <button
            className={`nv-check ${n.done ? 'is-checked' : ''}`}
            onClick={() => toggleDone(n)}
            aria-label={n.done ? 'Mark not done' : 'Mark done'}
          >
            {n.done ? '✓' : ''}
          </button>
        )}
        <button
          className="nv-note-body"
          onClick={() => setEditing({ index: n.index, text: n.text, category: n.cat })}
        >
          <span className="nv-note-meta">
            <span className="nv-tag" style={{ background: st.bg, color: st.fg }}>{n.cat}</span>
            <span className="nv-date">{noteDate(n.timestamp)}</span>
          </span>
          <span className="nv-note-text">{n.text}</span>
        </button>
      </div>
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
        <span className="nv-header-right" />
      </header>

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
                  onClick={() => setEditing({ index: n.index, text: n.text, category: n.cat })}
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
          <CategoryChips value={category} onChange={setCategory} />
          <div className="nv-compose-actions">
            <MicButton onText={(t) => setText((prev) => (prev ? prev.trimEnd() + ' ' : '') + t)} />
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
        {notes.length > 0 && <div className="nv-hint">Tap a note to edit or delete it</div>}
      </div>
    </div>
  );
}
