// file: src/NotesRangeSheet.jsx
// "Which notes?" pop-up before sharing or printing notes: a day, a stretch of days, or all of them.
// onPick({ range: [startMs, endMs) | null (= all), label: 'Nov 5, 2026' | '' })
import React, { useState } from 'react';
import './NotesRangeSheet.css';

const DAY = 86400000;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const fromInput = (v) => {
  const [y, m, d] = (v || '').split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
};
const toInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function rangeText(range) {
  if (!range) return '';
  const [a, b] = range;
  const last = b - 1;
  const fmt = (t, y) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) });
  if (dayStart(new Date(a)) === dayStart(new Date(last))) return new Date(a).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const sameYear = new Date(a).getFullYear() === new Date(last).getFullYear();
  return `${fmt(a, !sameYear)} – ${fmt(last, true)}`;
}

export default function NotesRangeSheet({ title = 'Share Which Notes?', onPick, onCancel }) {
  const now = new Date();
  const today = dayStart(now);
  const [mode, setMode] = useState(null); // null | 'day' | 'range'
  const [day, setDay] = useState(toInput(now));
  const [from, setFrom] = useState(toInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toInput(now));
  const pick = (range) => onPick({ range, label: rangeText(range) });
  const quick = [
    ['Today', [today, today + DAY]],
    ['Yesterday', [today - DAY, today]],
    ['Last 7 Days', [today - 6 * DAY, today + DAY]],
    ['This Month', [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), today + DAY]],
    ['Last Month', [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime()]],
  ];
  const fromD = fromInput(from);
  const toD = fromInput(to);
  const rangeOk = fromD && toD && dayStart(fromD) <= dayStart(toD);
  return (
    <div className="nr-backdrop" onClick={onCancel}>
      <div className="nr-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="nr-group">
          <div className="nr-head">{title}</div>
          {mode === 'day' ? (
            <div className="nr-pick">
              <label className="nr-row">
                <span>Day</span>
                <input type="date" className="nr-date" value={day} onChange={(e) => setDay(e.target.value)} />
              </label>
              <button className="nr-go" disabled={!fromInput(day)} onClick={() => { const d = dayStart(fromInput(day)); pick([d, d + DAY]); }}>
                Use This Day
              </button>
            </div>
          ) : mode === 'range' ? (
            <div className="nr-pick">
              <label className="nr-row">
                <span>From</span>
                <input type="date" className="nr-date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="nr-row">
                <span>To</span>
                <input type="date" className="nr-date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <button className="nr-go" disabled={!rangeOk} onClick={() => pick([dayStart(fromD), dayStart(toD) + DAY])}>
                Use These Dates
              </button>
            </div>
          ) : (
            <>
              {quick.map(([label, r]) => (
                <button key={label} className="nr-btn" onClick={() => pick(r)}>{label}</button>
              ))}
              <button className="nr-btn" onClick={() => setMode('day')}>Pick A Day…</button>
              <button className="nr-btn" onClick={() => setMode('range')}>Pick Dates (From – To)…</button>
              <button className="nr-btn nr-strong" onClick={() => pick(null)}>All Notes</button>
            </>
          )}
        </div>
        <button className="nr-btn nr-cancel" onClick={mode ? () => setMode(null) : onCancel}>
          {mode ? 'Back' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
