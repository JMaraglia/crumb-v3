// file: src/MasterNotesPage.jsx
// Every note from every customer and prospect in one place, filled in automatically.
// Group by day / month / year; filter by account, customers vs prospects, label, or text.
// Tap a note to open that account's notes. Follow-ups can be ticked off here too.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline, IoPrintOutline } from 'react-icons/io5';
import { NOTE_CATEGORIES, normalizeCategory, categoryStyle } from './NotesView';
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

export default function MasterNotesPage({ contacts = [], setContacts, prospects = [], setProspects }) {
  const navigate = useNavigate();
  const [grouping, setGrouping] = useState('Day');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');          // all | customer | prospect
  const [accountKey, setAccountKey] = useState('all'); // all | customer-1 | prospect-3
  const [label, setLabel] = useState('all');        // all | open | a category
  const [showFilters, setShowFilters] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

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
        });
      })
    );
  collect(contacts, 'customer');
  collect(prospects, 'prospect');

  const accountOptions = [
    ...contacts.filter(hasName).map((a) => ({ key: `customer-${a.id}`, name: a.name, kind: 'Customer' })),
    ...prospects.filter(hasName).map((a) => ({ key: `prospect-${a.id}`, name: a.name, kind: 'Prospect' })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const q = search.trim().toLowerCase();
  const shown = all
    .filter((n) => type === 'all' || n.kind === type)
    .filter((n) => accountKey === 'all' || `${n.kind}-${n.accountId}` === accountKey)
    .filter((n) =>
      label === 'all' ? true : label === 'open' ? n.cat === 'Follow-up' && !n.done : n.cat === label
    )
    .filter((n) => !q || (n.text || '').toLowerCase().includes(q) || n.accountName.toLowerCase().includes(q))
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
        const notes = [...(a.notes || [])];
        notes[n.index] = { ...notes[n.index], done: !notes[n.index].done };
        return { ...a, notes };
      });
    if (n.kind === 'prospect' && setProspects) setProspects(update);
    if (n.kind === 'customer' && setContacts) setContacts(update);
  };

  const filtersOn = type !== 'all' || accountKey !== 'all' || label !== 'all' || q;
  const filterCount = [type !== 'all', accountKey !== 'all', label !== 'all'].filter(Boolean).length;
  const clearFilters = () => {
    setType('all');
    setAccountKey('all');
    setLabel('all');
    setSearch('');
  };

  // What's being shown, in words: "All notes" or "Prospects · Nelly Rose Diner · Visit · "shrimp""
  const accountName = accountKey === 'all' ? '' : (accountOptions.find((a) => a.key === accountKey) || {}).name || '';
  const filterSummary =
    [
      type === 'customer' ? 'Customers' : type === 'prospect' ? 'Prospects' : '',
      accountName,
      label === 'all' ? '' : label === 'open' ? 'Open follow-ups' : label === 'General' ? 'No label' : label,
      q ? `"${search.trim()}"` : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'All notes';

  const whenText = (n) => (grouping === 'Day' ? timeOnly(n.time) : `${shortDay(n.time)}, ${timeOnly(n.time)}`);

  const shareNotes = async () => {
    setShareMsg('');
    const lines = [`Crumb notes · ${filterSummary}`];
    groups.forEach((g) => {
      lines.push('', `${g.label.toUpperCase()} (${groupSide(g)})`);
      g.notes.forEach((n) => {
        const box = n.cat === 'Follow-up' ? (n.done ? '☑ ' : '☐ ') : '';
        const tag = n.cat !== 'General' ? ` [${n.cat}]` : '';
        lines.push(`${box}${whenText(n)} · ${n.accountName}${tag}`, `   ${n.text}`);
      });
    });
    const text = lines.join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Crumb notes', text });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareMsg('Notes copied. Paste them into a text or email.');
    } catch {
      setShareMsg("Sharing isn't available here. Use Print instead.");
    }
  };

  const printNotes = () => {
    setShareMsg('');
    try {
      window.print();
    } catch {
      setShareMsg("Printing isn't available here. Use Share instead.");
    }
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
            <button className="mn-pill" disabled={!shown.length} onClick={shareNotes}>
              <IoShareOutline className="mn-pill-icon" />
              Share
            </button>
            <button className="mn-pill" disabled={!shown.length} onClick={printNotes}>
              <IoPrintOutline className="mn-pill-icon" />
              Print
            </button>
          </div>
        </div>
        {shareMsg && <div className="mn-share-msg">{shareMsg}</div>}

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
                const isFollowUp = n.cat === 'Follow-up';
                return (
                  <div
                    key={`${n.kind}-${n.accountId}-${n.index}`}
                    className={`mn-row ${isFollowUp && n.done ? 'is-done' : ''}`}
                  >
                    <div className="mn-when">
                      {grouping !== 'Day' && <span className="mn-when-day">{shortDay(n.time)}</span>}
                      <span>{timeOnly(n.time)}</span>
                    </div>
                    <div className="mn-main">
                      <div className={`mn-name ${n.kind}`}>
                        {isFollowUp ? (
                          <button
                            className={`mn-check ${n.done ? 'is-checked' : ''}`}
                            onClick={() => toggleDone(n)}
                            aria-label={n.done ? 'Mark not done' : 'Mark done'}
                          >
                            {n.done ? '✓' : ''}
                          </button>
                        ) : (
                          <span className="mn-dot" />
                        )}
                        <button className="mn-account" onClick={() => openAccountNotes(n)}>
                          {n.accountName}
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
                  </div>
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
            <div className="mn-print-heading">{filterSummary}</div>
            <div className="mn-print-count">
              {shown.length} {shown.length === 1 ? 'note' : 'notes'}
            </div>
          </div>
          {groups.map((g) => (
            <div key={g.label} className="mn-print-group">
              <div className="mn-print-group-head">
                <span>{g.label}</span>
                <span className="mn-print-group-side">{groupSide(g)}</span>
              </div>
              {g.notes.map((n) => (
                <div key={`${n.kind}-${n.accountId}-${n.index}`} className="mn-print-row">
                  <div className="mn-print-when">{whenText(n)}</div>
                  <div>
                    <div className="mn-print-name">
                      {n.cat === 'Follow-up' && <span className="mn-print-box">{n.done ? '☑' : '☐'}</span>}
                      {n.accountName}
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
              <label className="mn-sheet-row">
                <span>Account</span>
                <select className="mn-select" value={accountKey} onChange={(e) => setAccountKey(e.target.value)}>
                  <option value="all">All accounts</option>
                  {accountOptions
                    .filter((a) => type === 'all' || a.kind.toLowerCase() === type)
                    .map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.name}
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
