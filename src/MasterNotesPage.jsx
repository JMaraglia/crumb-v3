// file: src/MasterNotesPage.jsx
// Every note from every customer and prospect in one place, filled in automatically.
// Group by day / month / year; filter by account, customers vs prospects, label, or text.
// Tap a note to open that account's notes. Follow-ups can be ticked off here too.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline, IoPrintOutline } from 'react-icons/io5';
import { NOTE_CATEGORIES, normalizeCategory, categoryStyle } from './NotesView';
import { buildNotesPdf } from './notesPdf';
import NotesRangeSheet from './NotesRangeSheet';
import { isCheckable, isNoteDone } from './noteStatus';
import SwipeRow from './SwipeRow';
import { changeNote, dropNote } from './store';
import './MasterNotesPage.css';

const GROUPINGS = ['Day', 'Month', 'Year'];

function hasName(a) {
  return a && a.name && a.name.trim();
}

function groupLabel(time, grouping) {
  if (!time) return 'No date';
  const d = new Date(time);
  if (grouping === 'Year') return String(d.getFullYear());
  if (grouping === 'Month') return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function timeOnly(time) {
  if (!time) return '';
  return new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function shortDay(time) {
  if (!time) return '';
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Date filter choices
const DATE_RANGES = [
  ['any', 'Any time'],
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Last 7 days'],
  ['month', 'This month'],
  ['lastMonth', 'Last month'],
  ['custom', 'Pick dates'],
];

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const fromInput = (v) => {
  const [y, m, d] = (v || '').split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
};
const toInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// [start, end) in milliseconds for a date choice, or null for "any time"
function rangeFor(choice, from, to) {
  const now = new Date();
  const today = dayStart(now);
  const DAY = 86400000;
  if (choice === 'today') return [today, today + DAY];
  if (choice === 'yesterday') return [today - DAY, today];
  if (choice === 'week') return [today - 6 * DAY, today + DAY];
  if (choice === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), today + DAY];
  if (choice === 'lastMonth')
    return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime()];
  if (choice === 'custom') {
    const a = fromInput(from);
    const b = fromInput(to);
    if (!a && !b) return null;
    return [a ? dayStart(a) : 0, b ? dayStart(b) + DAY : Infinity];
  }
  return null;
}

// "Oct 1 – Oct 31, 2026" style label for the printout / PDF heading
function rangeLabel(range) {
  if (!range) return '';
  const [a, b] = range;
  const fmt = (t, withYear) =>
    new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
  if (!a) return `Through ${fmt(b - 1, true)}`;
  if (b === Infinity) return `Since ${fmt(a, true)}`;
  const last = b - 1;
  if (dayStart(new Date(a)) === dayStart(new Date(last))) return fmt(a, true);
  const sameYear = new Date(a).getFullYear() === new Date(last).getFullYear();
  return `${fmt(a, !sameYear)} – ${fmt(last, true)}`;
}

export default function MasterNotesPage({ contacts = [], setContacts, prospects = [], setProspects }) {
  const navigate = useNavigate();
  const [grouping, setGrouping] = useState('Day');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');          // all | customer | prospect
  const [accountKey, setAccountKey] = useState('all'); // all | customer-1 | prospect-3
  const [groupKey, setGroupKey] = useState('all');     // all | a group id (businesses with several locations)
  const [label, setLabel] = useState('all');        // all | open | a category
  const [showFilters, setShowFilters] = useState(false);
  const [dateChoice, setDateChoice] = useState('any');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [askFor, setAskFor] = useState(null);        // 'share' | 'print' while "which notes?" is open
  const [out, setOut] = useState(null);              // { range, label } used by the printout

  // Gather every note with where it came from.
  const all = [];
  const collect = (list, kind) =>
    list.filter(hasName).forEach((acct) =>
      (acct.notes || []).forEach((n, index) => {
        all.push({
          ...n,
          index,
          cat: normalizeCategory(n.category),
          time: Date.parse(n.timestamp) || 0,
          kind,
          accountId: acct.id,
          accountName: acct.name,
          group: String(acct.group || '').trim(),
          town: acct.town || '',
        });
      })
    );
  collect(contacts, 'customer');
  collect(prospects, 'prospect');

  const accountOptions = [
    ...contacts.filter(hasName).map((a) => ({ key: `customer-${a.id}`, name: a.name, town: a.town || '', group: String(a.group || '').trim(), kind: 'Customer' })),
    ...prospects.filter(hasName).map((a) => ({ key: `prospect-${a.id}`, name: a.name, town: a.town || '', group: String(a.group || '').trim(), kind: 'Prospect' })),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.town.localeCompare(b.town));
  // Several locations with the same name → show the town too
  const nameCount = {};
  accountOptions.forEach((a) => (nameCount[a.name] = (nameCount[a.name] || 0) + 1));
  const optionLabel = (a) => (a.group || nameCount[a.name] > 1) && a.town ? `${a.name} – ${a.town}` : a.name;
  // Groups: shown by the business name of their locations, with how many locations
  const groupOptions = [];
  accountOptions.forEach((a) => {
    if (!a.group) return;
    const g = groupOptions.find((x) => x.key === a.group);
    if (g) g.count += 1;
    else groupOptions.push({ key: a.group, name: a.name, count: 1 });
  });
  groupOptions.sort((a, b) => a.name.localeCompare(b.name));
  const groupName = groupKey === 'all' ? '' : ((groupOptions.find((g) => g.key === groupKey) || {}).name || '') + ' (all locations)';

  const q = search.trim().toLowerCase();
  const range = rangeFor(dateChoice, dateFrom, dateTo);
  const shown = all
    .filter((n) => type === 'all' || n.kind === type)
    .filter((n) => groupKey === 'all' || n.group === groupKey)
    .filter((n) => accountKey === 'all' || `${n.kind}-${n.accountId}` === accountKey)
    .filter((n) =>
      label === 'all' ? true : label === 'open' ? n.cat === 'Follow-up' && !n.done : n.cat === label
    )
    .filter((n) => !q || (n.text || '').toLowerCase().includes(q) || n.accountName.toLowerCase().includes(q))
    .filter((n) => !range || (n.time >= range[0] && n.time < range[1]))
    .sort((a, b) => b.time - a.time);

  // Group in order (already newest first).
  const groups = [];
  shown.forEach((n) => {
    const g = groupLabel(n.time, grouping);
    if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, notes: [] });
    groups[groups.length - 1].notes.push(n);
  });

  const openAccountNotes = (n) =>
    navigate(n.kind === 'prospect' ? `/prospect-notes/${n.accountId}` : `/notes/${n.accountId}`);

  const toggleDone = (n) => {
    const update = (list) =>
      list.map((a) => {
        if (a.id !== n.accountId) return a;
        return { ...a, notes: changeNote(a.notes || [], { id: n.id, index: n.index }, (old) => ({ ...old, done: !isNoteDone(old) })) };
      });
    if (n.kind === 'prospect' && setProspects) setProspects(update);
    if (n.kind === 'customer' && setContacts) setContacts(update);
  };

  // Swipe a note left → asks, then deletes it from that account for good.
  const deleteNote = (n) => {
    if (!window.confirm(`Delete this note permanently?\n\n${n.accountName}: "${n.text.length > 80 ? n.text.slice(0, 80) + '…' : n.text}"\n\nIt can't be undone.`)) return;
    const update = (list) =>
      list.map((a) => (a.id === n.accountId ? { ...a, notes: dropNote(a.notes || [], { id: n.id, index: n.index }) } : a));
    if (n.kind === 'prospect' && setProspects) setProspects(update);
    if (n.kind === 'customer' && setContacts) setContacts(update);
  };

  const filtersOn = type !== 'all' || groupKey !== 'all' || accountKey !== 'all' || label !== 'all' || q || range;
  const filterCount = [type !== 'all', groupKey !== 'all', accountKey !== 'all', label !== 'all', Boolean(range)].filter(Boolean).length;
  const clearFilters = () => {
    setType('all');
    setGroupKey('all');
    setAccountKey('all');
    setLabel('all');
    setSearch('');
    setDateChoice('any');
    setDateFrom('');
    setDateTo('');
  };

  // What's being shown, in words: "All notes" or "Prospects · Nelly Rose Diner · Visit · "shrimp""
  const pickedAccount = accountKey === 'all' ? null : accountOptions.find((a) => a.key === accountKey);
  const accountName = pickedAccount ? optionLabel(pickedAccount) : '';
  const filterSummary =
    [
      rangeLabel(range),
      type === 'customer' ? 'Customers' : type === 'prospect' ? 'Prospects' : '',
      accountName || groupName,
      label === 'all' ? '' : label === 'open' ? 'Open follow-ups' : label === 'General' ? 'No label' : label,
      q ? `"${search.trim()}"` : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'All notes';

  const whenText = (n) => (grouping === 'Day' ? timeOnly(n.time) : `${shortDay(n.time)}, ${timeOnly(n.time)}`);

  // Notes going out (share / print): what's on screen, narrowed to the days picked
  const outGroups = (sel) =>
    !sel || !sel.range
      ? groups
      : groups
          .map((g) => ({ ...g, notes: g.notes.filter((n) => n.time >= sel.range[0] && n.time < sel.range[1]) }))
          .filter((g) => g.notes.length);
  const outHeading = (sel) => [filterSummary === 'All notes' && sel && sel.label ? '' : filterSummary, sel && sel.label].filter(Boolean).join(' · ') || 'All notes';

  const shareNotes = async (sel = null) => {
    setShareMsg('');
    const fileName = 'Crumb notes.pdf';
    const gs = outGroups(sel);
    if (!gs.length) return setShareMsg('No notes on those days.');
    const blob = buildNotesPdf({ heading: outHeading(sel), groups: gs, groupSide, whenText });
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Crumb notes' });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // closed the share sheet
    }
    // Fallback: download the PDF
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShareMsg('PDF downloaded.');
  };

  const printNotes = (sel = null) => {
    setShareMsg('');
    if (!outGroups(sel).length) return setShareMsg('No notes on those days.');
    setOut(sel); // the printout below follows the days picked
    setTimeout(() => {
      try {
        window.print();
      } catch {
        setShareMsg("Printing isn't available here. Use Share instead.");
      }
    }, 80);
  };

  // Right side of a group heading: the date for Today / Yesterday, otherwise how many notes
  const groupSide = (g) =>
    (g.label === 'Today' || g.label === 'Yesterday') && g.notes[0] && g.notes[0].time
      ? new Date(g.notes[0].time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : `${g.notes.length} ${g.notes.length === 1 ? 'note' : 'notes'}`;

  return (
    <div className="mn-page">
      <header className="mn-header">
        <button className="mn-icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <FaArrowLeft />
        </button>
        <span />
        <span />
      </header>

      <div className="mn-content">
        <div className="mn-title-row">
          <h1 className="mn-title">Notes</h1>
          <div className="mn-actions">
            <button className="mn-pill" disabled={!shown.length} onClick={() => setAskFor('share')}>
              <IoShareOutline className="mn-pill-icon" />
              Share
            </button>
            <button className="mn-pill" disabled={!shown.length} onClick={() => setAskFor('print')}>
              <IoPrintOutline className="mn-pill-icon" />
              Print
            </button>
          </div>
        </div>
        {shareMsg && <div className="mn-share-msg">{shareMsg}</div>}
        {askFor && (
          <NotesRangeSheet
            title={askFor === 'print' ? 'Print Which Notes?' : 'Share Which Notes?'}
            onCancel={() => setAskFor(null)}
            onPick={(sel) => {
              const what = askFor;
              setAskFor(null);
              if (what === 'print') printNotes(sel);
              else shareNotes(sel);
            }}
          />
        )}

        <input
          className="mn-search"
          placeholder="Search notes or accounts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Day / Month / Year + Filters */}
        <div className="mn-toolbar">
          <div className="mn-seg">
            {GROUPINGS.map((g) => (
              <button key={g} className={`mn-seg-btn ${grouping === g ? 'is-on' : ''}`} onClick={() => setGrouping(g)}>
                {g}
              </button>
            ))}
          </div>
          <button className={`mn-filter-btn ${filterCount ? 'is-on' : ''}`} onClick={() => setShowFilters(true)}>
            Filters{filterCount ? ` · ${filterCount}` : ''}
            <span className="mn-chev">▾</span>
          </button>
        </div>

        <div className="mn-count">
          {shown.length} {shown.length === 1 ? 'note' : 'notes'}
          {filtersOn && (
            <button className="mn-clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {all.length === 0 ? (
          <div className="mn-empty">No notes yet. Notes you add to customers and prospects show up here.</div>
        ) : shown.length === 0 ? (
          <div className="mn-empty">No notes match.</div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mn-group">
              <div className="mn-group-head">
                <span className="mn-group-title">{g.label}</span>
                <span className="mn-group-side">{groupSide(g)}</span>
              </div>
              {g.notes.map((n) => {
                const st = categoryStyle(n.cat);
                const isFollowUp = isCheckable(n.cat); // Follow-ups and Samples have a checkbox
                const isDone = isFollowUp && isNoteDone(n);
                return (
                  <SwipeRow
                    key={`${n.kind}-${n.accountId}-${n.index}`}
                    className={`mn-row ${isDone ? 'is-done' : ''}`}
                    onDelete={() => deleteNote(n)}
                  >
                    <div className="mn-when">
                      {grouping !== 'Day' && <span className="mn-when-day">{shortDay(n.time)}</span>}
                      <span>{timeOnly(n.time)}</span>
                    </div>
                    <div className="mn-main">
                      <div className={`mn-name ${n.kind}`}>
                        {isFollowUp ? (
                          <button
                            className={`mn-check ${isDone ? 'is-checked' : ''}`}
                            onClick={() => toggleDone(n)}
                            aria-label={isDone ? 'Mark not done' : 'Mark done'}
                          >
                            {isDone ? '✓' : ''}
                          </button>
                        ) : (
                          <span className="mn-dot" />
                        )}
                        <button className="mn-account" onClick={() => openAccountNotes(n)}>
                          {n.accountName}
                          {n.group && n.town ? ` – ${n.town}` : ''}
                        </button>
                      </div>
                      <button className="mn-note-body" onClick={() => openAccountNotes(n)}>
                        <span className="mn-text">{n.text}</span>
                        {n.cat !== 'General' && (
                          <span className="mn-label" style={{ color: st.fg }}>
                            {n.cat}
                          </span>
                        )}
                      </button>
                    </div>
                  </SwipeRow>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Only shows on the printed / PDF copy */}
      {shown.length > 0 && (
        <div className="mn-print">
          <div className="mn-print-top">
            <div className="mn-print-brand">Crumb.</div>
            <div className="mn-print-kicker">Notes</div>
          </div>
          <div className="mn-print-bottom">
            <div className="mn-print-heading">{outHeading(out)}</div>
          </div>
          {outGroups(out).map((g) => (
            <div key={g.label} className="mn-print-group">
              <div className="mn-print-group-head">
                <span>{g.label}</span>
                {(g.label === 'Today' || g.label === 'Yesterday') && (
                  <span className="mn-print-group-side">{groupSide(g)}</span>
                )}
              </div>
              {g.notes.map((n) => (
                <div key={`${n.kind}-${n.accountId}-${n.index}`} className="mn-print-row">
                  <div className="mn-print-when">{whenText(n)}</div>
                  <div>
                    <div className="mn-print-name">
                      {isCheckable(n.cat) && <span className="mn-print-box">{isNoteDone(n) ? '☑' : '☐'}</span>}
                      {n.accountName}
                          {n.group && n.town ? ` – ${n.town}` : ''}
                      <span className="mn-print-kind">{n.kind === 'prospect' ? 'Prospect' : 'Customer'}</span>
                      {n.cat !== 'General' && <span className="mn-print-label">{n.cat}</span>}
                    </div>
                    <div className="mn-print-text">{n.text}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <div className="mn-sheet-backdrop" onClick={() => setShowFilters(false)}>
          <div className="mn-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mn-sheet-top">
              <button className="mn-sheet-link" onClick={clearFilters}>Clear</button>
              <div className="mn-sheet-title">Filters</div>
              <button className="mn-sheet-link mn-bold" onClick={() => setShowFilters(false)}>Done</button>
            </div>
            <div className="mn-sheet-group">
              <label className="mn-sheet-row">
                <span>Dates</span>
                <select
                  className="mn-select"
                  value={dateChoice}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDateChoice(v);
                    if (v === 'custom' && !dateFrom && !dateTo) {
                      const t = toInput(new Date());
                      setDateFrom(t);
                      setDateTo(t);
                    }
                  }}
                >
                  {DATE_RANGES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {dateChoice === 'custom' && (
                <>
                  <label className="mn-sheet-row">
                    <span className="mn-sub-label">From</span>
                    <input type="date" className="mn-date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </label>
                  <label className="mn-sheet-row">
                    <span className="mn-sub-label">To</span>
                    <input type="date" className="mn-date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </label>
                </>
              )}
            </div>
            <div className="mn-sheet-group mn-sheet-gap">
              <label className="mn-sheet-row">
                <span>Show</span>
                <select
                  className="mn-select"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    setAccountKey('all');
                  }}
                >
                  <option value="all">Customers & prospects</option>
                  <option value="customer">Customers</option>
                  <option value="prospect">Prospects</option>
                </select>
              </label>
              {groupOptions.length > 0 && (
                <label className="mn-sheet-row">
                  <span>Group</span>
                  <select
                    className="mn-select"
                    value={groupKey}
                    onChange={(e) => {
                      setGroupKey(e.target.value);
                      setAccountKey('all');
                    }}
                  >
                    <option value="all">All groups</option>
                    {groupOptions.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.name} ({g.count} locations)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="mn-sheet-row">
                <span>{groupKey === 'all' ? 'Account' : 'Location'}</span>
                <select className="mn-select" value={accountKey} onChange={(e) => setAccountKey(e.target.value)}>
                  <option value="all">{groupKey === 'all' ? 'All accounts' : 'All locations'}</option>
                  {accountOptions
                    .filter((a) => type === 'all' || a.kind.toLowerCase() === type)
                    .filter((a) => groupKey === 'all' || a.group === groupKey)
                    .map((a) => (
                      <option key={a.key} value={a.key}>
                        {optionLabel(a)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="mn-sheet-row">
                <span>Label</span>
                <select className="mn-select" value={label} onChange={(e) => setLabel(e.target.value)}>
                  <option value="all">All labels</option>
                  <option value="open">Open follow-ups</option>
                  {NOTE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'General' ? 'No label' : c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
