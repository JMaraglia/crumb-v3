// file: src/AccountViews.jsx
// Shared screens for an account list (Prospects now, Customers next):
//   AccountList   – search, sort, tap a row
//   AccountDetail – one account: address, contacts, days, notes
//   AccountEdit   – one form for adding and editing (Save / Cancel / Delete)
// Data shape is unchanged: { id, name, address, contacts[], deliveryDays[], notes[] }
// (+ accountNumber for customers).
import React, { useState } from 'react';
import { FaArrowLeft, FaChevronRight, FaPhoneAlt, FaMapMarkerAlt, FaEnvelope } from 'react-icons/fa';
import { useNavigate, useParams } from 'react-router-dom';
import './AccountViews.css';
import { DAYS, FREQUENCIES, STAGES, stageInfo, nextVisitDate, snoozeUntilFor, isSnoozed } from './schedule';

// Re-exported so other files can keep importing these from here.
export { DAYS, FREQUENCIES, STAGES, stageInfo };


// Go back like the iPhone back gesture; if there's nowhere to go back to, go to `fallback`.
function useGoBack() {
  const navigate = useNavigate();
  return (fallback, steps = 1) => {
    const idx = window.history.state && window.history.state.idx;
    if (typeof idx === 'number' && idx >= steps) navigate(-steps);
    else navigate(fallback, { replace: true });
  };
}

function digitsOnly(phone) {
  return (phone || '').replace(/[^\d+]/g, '');
}

/* ---------- Visit schedule ----------
   visitTime: minutes from midnight (e.g. 600 = 10:00 AM), or null for no set time
   visitFrequency: one of the keys below
   visitStart: 'YYYY-MM-DD' first visit, so "every 2 weeks" knows which weeks
   Visit days use config.visitDaysField (prospects: deliveryDays, as before). */

function frequencyLabel(key) {
  const f = FREQUENCIES.find((x) => x.key === key);
  return f ? f.label : 'Weekly';
}

function shortFrequency(key) {
  return { weekly: 'Weekly', '2w': 'Every 2 wks', '3w': 'Every 3 wks', '4w': 'Monthly', '8w': 'Every 2 mos' }[key] || 'Weekly';
}

export function timeLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m === 0 ? '00' : m} ${h < 12 ? 'AM' : 'PM'}`;
}

// 5:00 AM … 11:30 PM first, then 12:00 AM … 4:30 AM at the bottom
// (iPhone's time wheel starts at the top, so this avoids landing on 3:30 AM by accident).
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => ((i + 10) % 48) * 30);

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Tue · 10:00 AM" / "Tue, Thu" / null when no visit days are set
function visitSummary(account, config) {
  const days = DAYS.filter((d) => (account[config.visitDaysField] || []).includes(d));
  if (days.length === 0) return null;
  const dayText = days.join(', ');
  return typeof account.visitTime === 'number' ? `${dayText} · ${timeLabel(account.visitTime)}` : dayText;
}

/* ---------- Prospect stages (saved as account.stage) ---------- */


function StageChip({ stage }) {
  const st = stageInfo(stage);
  if (!st) return null;
  return (
    <span className="av-chip av-stage-chip" style={{ background: st.color, color: '#fff' }}>
      {st.label}
    </span>
  );
}

// Same 12 colors as the calendar; each account keeps the same color by name.
const AVATAR_COLORS = ['#0077cc', '#ff3b30', '#ff9500', '#e6b800', '#34c759', '#00c7be', '#30b0c7', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93'];
function avatarColor(name) {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name, size = 40 }) {
  const letter = ((name || '').trim()[0] || '?').toUpperCase();
  return (
    <span className="av-avatar" style={{ backgroundColor: avatarColor(name), width: size, height: size, lineHeight: `${size}px`, fontSize: size * 0.42 }}>
      {letter}
    </span>
  );
}

function isBackground(n) {
  return n && n.category === 'Background';
}

// Background notes (profile info) are shown pinned, newest first.
function backgroundNotes(account) {
  return (account.notes || [])
    .filter(isBackground)
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
}

function BackgroundBox({ notes, onClick }) {
  if (!notes.length) return null;
  return (
    <button className="av-background" onClick={onClick}>
      <span className="av-background-title">Background</span>
      {notes.map((n, i) => (
        <span key={i} className="av-background-line">{n.text}</span>
      ))}
    </button>
  );
}

// Newest regular note (Background notes are shown separately).
export function lastNote(account) {
  const notes = (account.notes || []).filter((n) => !isBackground(n));
  if (notes.length === 0) return null;
  let best = notes[notes.length - 1];
  let bestTime = Date.parse(best.timestamp) || 0;
  notes.forEach((n) => {
    const t = Date.parse(n.timestamp) || 0;
    if (t > bestTime) {
      best = n;
      bestTime = t;
    }
  });
  return best;
}

export function shortDate(timestamp) {
  const t = Date.parse(timestamp);
  if (!t) return '';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A record with nothing in it at all (left over from the old Add button).
function isEmptyRecord(a) {
  return (
    !(a.name && a.name.trim()) &&
    !(a.address && a.address.trim()) &&
    !(a.contacts || []).some((c) => c && (c.name || c.phone || c.textPhone || c.email || c.title)) &&
    !(a.notes || []).length
  );
}

function displayName(account) {
  return account.name && account.name.trim() ? account.name : '(No name)';
}

// Bottom pop-up with choices (Call / Text / Email, Apple Maps / Google Maps).
export function ActionSheet({ title, actions, onClose }) {
  return (
    <div className="av-sheet-backdrop" onClick={onClose}>
      <div className="av-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="av-sheet-group">
          {title && <div className="av-sheet-title">{title}</div>}
          {actions.map((a) =>
            a.onClick ? (
              <button
                key={a.label}
                className={`av-sheet-action ${a.danger ? 'is-danger' : ''}`}
                onClick={() => {
                  a.onClick();
                  onClose();
                }}
              >
                {a.label}
              </button>
            ) : (
              <a key={a.label} className="av-sheet-action" href={a.href} target={a.newTab ? '_blank' : undefined} rel="noreferrer" onClick={onClose}>
                {a.label}
              </a>
            )
          )}
        </div>
        <button className="av-sheet-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// Snooze pop-up: skip the next visit, or pause visits for 1–4 weeks.
// `save(snoozeUntil)` stores the new date (null = end the snooze).
export function snoozeSheet(account, save) {
  const actions = [
    { label: 'Skip next visit', onClick: () => save(snoozeUntilFor(account, 'skip')) },
    { label: 'Snooze 1 week', onClick: () => save(snoozeUntilFor(account, 1)) },
    { label: 'Snooze 2 weeks', onClick: () => save(snoozeUntilFor(account, 2)) },
    { label: 'Snooze 3 weeks', onClick: () => save(snoozeUntilFor(account, 3)) },
    { label: 'Snooze 4 weeks', onClick: () => save(snoozeUntilFor(account, 4)) },
  ];
  if (isSnoozed(account)) actions.push({ label: 'End snooze', danger: true, onClick: () => save(null) });
  return { title: `Snooze visits to ${account.name || 'this account'}`, actions };
}

function niceShort(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Snoozed · back Nov 24" (the first visit after the snooze ends)
export function SnoozeChip({ account }) {
  if (!isSnoozed(account)) return null;
  const back = nextVisitDate(account, account.snoozeUntil);
  return (
    <span className="av-chip av-chip-snooze">
      Snoozed · {back ? `back ${niceShort(back)}` : `until ${niceShort(account.snoozeUntil)}`}
    </span>
  );
}

function hasVisitDays(account, config) {
  return (account[config.visitDaysField] || []).length > 0;
}

export function mapActions(address) {
  const q = encodeURIComponent(address);
  return [
    { label: 'Apple Maps', href: `https://maps.apple.com/?q=${q}`, newTab: true },
    { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${q}`, newTab: true },
  ];
}

// A contact can have two numbers: `phone` for calls (e.g. the restaurant line)
// and `textPhone` for texts (a cell). If textPhone is blank, texts go to phone.
function textNumber(c) {
  return (c.textPhone && c.textPhone.trim()) || c.phone || '';
}

function canReach(c) {
  return Boolean(c && (c.phone || c.textPhone || c.email));
}

// Call / Text / Email choices for one contact. `withName` labels them by name
// (used when several contacts are listed together).
function contactActions(c, withName = false) {
  const who = withName ? ` ${c.name || 'contact'}` : '';
  const actions = [];
  if (c.phone) actions.push({ label: `Call${who || ' ' + c.phone}`, href: `tel:${digitsOnly(c.phone)}` });
  const t = textNumber(c);
  if (t) actions.push({ label: `Text${who || ' ' + t}`, href: `sms:${digitsOnly(t)}` });
  if (c.email) actions.push({ label: `Email${who || ' ' + c.email}`, href: `mailto:${c.email}` });
  return actions;
}

// The Contact pop-up for an account: one contact shows its choices directly;
// several contacts are all listed by name. Returns null if nobody is reachable.
export function contactSheet(contacts) {
  const reachable = (contacts || []).filter(canReach);
  if (reachable.length === 0) return null;
  if (reachable.length === 1) {
    const c = reachable[0];
    return { title: c.name || 'Contact', actions: contactActions(c) };
  }
  return { title: 'Contact', actions: reachable.flatMap((c) => contactActions(c, true)) };
}

const HOLD_MS = 500;      // hold a row this long to open the full screen (double-tap = Edit)
const HOLD_WIGGLE = 10;   // px a finger can move and still count as holding

// One prospect in the list. Tap: open/close the quick card in place.
// Hold: open the full screen.
const DOUBLE_TAP_MS = 320; // two taps this close together = double-tap

function ListRow({ account: a, config, expanded, onToggle, onOpenFull, onEdit, onSheet, onSnooze }) {
  const navigate = useNavigate();
  const hold = React.useRef(null);
  const lastTap = React.useRef(0);
  const visit = visitSummary(a, config);
  const latest = lastNote(a);
  const contacts = a.contacts || [];
  const mainContact = contacts.find((c) => c.name || c.title);
  const reachable = contacts.some(canReach);

  const startHold = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY, fired: false, el };
    start.timer = setTimeout(() => {
      // Held long enough: highlight now, open the full screen when the finger lifts.
      start.fired = true;
      el.classList.add('is-held');
    }, HOLD_MS);
    hold.current = start;
  };
  const moveHold = (e) => {
    const h = hold.current;
    if (h && (Math.abs(e.clientX - h.x) > HOLD_WIGGLE || Math.abs(e.clientY - h.y) > HOLD_WIGGLE)) {
      clearTimeout(h.timer);
      h.el.classList.remove('is-held');
      hold.current = null;
    }
  };
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
  };
  const tap = () => {
    const h = hold.current;
    hold.current = null;
    if (h && h.fired) {
      h.el.classList.remove('is-held');
      onOpenFull();
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      // Double-tap: straight to Edit
      lastTap.current = 0;
      onEdit();
      return;
    }
    lastTap.current = now;
    onToggle();
  };

  return (
    <div className={`av-item ${expanded ? 'is-open' : ''}`}>
      <button
        className="av-row av-list-row"
        onPointerDown={startHold}
        onPointerMove={moveHold}
        onPointerUp={endHold}
        onPointerCancel={() => {
          endHold();
          if (hold.current) hold.current.el.classList.remove('is-held');
          hold.current = null;
        }}
        onClick={tap}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Avatar name={a.name} size={expanded ? 48 : 40} />
        <span className="av-row-text">
          <span className={`av-row-name ${expanded ? 'is-big' : ''}`}>{displayName(a)}</span>
          {expanded ? (
            <span className="av-row-sub">
              {mainContact ? [mainContact.name, mainContact.title].filter(Boolean).join(' · ') : 'No contact yet'}
            </span>
          ) : (
            a.address && <span className="av-row-sub">{a.address}</span>
          )}
          {!expanded && (
            <span className="av-chips">
              {visit ? (
                <>
                  <span className="av-chip av-chip-blue">{visit}</span>
                  <span className="av-chip av-chip-gray">{shortFrequency(a.visitFrequency)}</span>
                </>
              ) : (
                <span className="av-chip av-chip-orange">No visit set</span>
              )}
              {config.hasStage && <StageChip stage={a.stage} />}
              <SnoozeChip account={a} />
            </span>
          )}
        </span>
        <FaChevronRight className={`av-row-chevron ${expanded ? 'is-open' : ''}`} />
      </button>

      {expanded && (
        <div className="av-expand">
          <BackgroundBox notes={backgroundNotes(a)} onClick={() => navigate(config.notesPath(a.id))} />
          {latest && (
            <button className="av-last-note" onClick={() => navigate(config.notesPath(a.id))}>
              <span className="av-last-note-date">{shortDate(latest.timestamp)}</span>
              {latest.text}
            </button>
          )}
          <div className="av-chips av-summary-chips">
            {visit ? (
              <>
                <span className="av-chip av-chip-blue">{visit}</span>
                <span className="av-chip av-chip-gray">{shortFrequency(a.visitFrequency)}</span>
              </>
            ) : (
              <span className="av-chip av-chip-orange">No visit set</span>
            )}
            {config.hasStage && <StageChip stage={a.stage} />}
            <SnoozeChip account={a} />
          </div>
          <div className="av-quick">
            <button className="av-quick-btn" disabled={!reachable} onClick={() => onSheet(contactSheet(contacts))}>
              Contact
            </button>
            <button
              className="av-quick-btn"
              disabled={!a.address}
              onClick={() => onSheet({ title: a.address, actions: mapActions(a.address) })}
            >
              Map
            </button>
            {onSnooze && hasVisitDays(a, config) && (
              <button className="av-quick-btn" onClick={() => onSheet(snoozeSheet(a, (until) => onSnooze(a.id, until)))}>
                {isSnoozed(a) ? 'Snoozed' : 'Snooze'}
              </button>
            )}
            <button className="av-quick-btn" onClick={() => navigate(config.notesPath(a.id))}>
              + Note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ onBack, title, right }) {
  return (
    <header className="av-header">
      <button className="av-icon-btn" onClick={onBack} aria-label="Back">
        <FaArrowLeft />
      </button>
      <div className="av-header-title">{title}</div>
      <div className="av-header-right">{right}</div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */
export function AccountList({ config, accounts, setAccounts }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortAZ, setSortAZ] = useState(true);
  const [openId, setOpenId] = useState(null); // the one row that's opened up
  const [stageFilter, setStageFilter] = useState('all');
  const [sheet, setSheet] = useState(null);   // Call/Text or Maps pop-up

  const q = search.trim().toLowerCase();
  const realAccounts = accounts.filter((a) => !isEmptyRecord(a)); // hide leftover blank records
  const shown = realAccounts
    .filter((a) => stageFilter === 'all' || (a.stage || 'none') === stageFilter)
    .filter((a) => {
      if (!q) return true;
      return (
        (a.name || '').toLowerCase().includes(q) ||
        (a.address || '').toLowerCase().includes(q) ||
        (config.hasAccountNumber && String(a.accountNumber || '').toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const an = (a.name || '').trim();
      const bn = (b.name || '').trim();
      if (!an && bn) return 1; // unnamed ones go last
      if (an && !bn) return -1;
      return sortAZ ? an.localeCompare(bn) : bn.localeCompare(an);
    });

  return (
    <div className="av-page">
      <Header onBack={() => navigate('/')} title="" />

      <div className="av-content">
        <h1 className="av-big-title">{config.plural}</h1>
        <input
          className="av-search"
          placeholder={config.hasAccountNumber ? 'Search name, address, or account #' : 'Search name or address'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="av-list-bar">
          {config.hasStage ? (
            <select
              className="av-stage-select"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              style={stageInfo(stageFilter) ? { color: stageInfo(stageFilter).color } : undefined}
            >
              <option value="all">All {config.plural.toLowerCase()} ({realAccounts.length})</option>
              {STAGES.map((st) => (
                <option key={st.key} value={st.key}>
                  {st.label} ({realAccounts.filter((a) => a.stage === st.key).length})
                </option>
              ))}
            </select>
          ) : (
            <span className="av-count">
              {shown.length} {shown.length === 1 ? config.singular.toLowerCase() : config.plural.toLowerCase()}
            </span>
          )}
          <button className="av-link-btn" onClick={() => setSortAZ((v) => !v)}>
            {sortAZ ? 'A–Z' : 'Z–A'}
          </button>
        </div>

        {realAccounts.length === 0 ? (
          <div className="av-empty">No {config.plural.toLowerCase()} yet. Tap + to add one.</div>
        ) : shown.length === 0 ? (
          <div className="av-empty">No matches.</div>
        ) : (
          <div className="av-group">
            {shown.map((a) => (
              <ListRow
                key={a.id}
                account={a}
                config={config}
                expanded={openId === a.id}
                onToggle={() => setOpenId((cur) => (cur === a.id ? null : a.id))}
                onOpenFull={() => navigate(`${config.basePath}/${a.id}`)}
                onEdit={() => navigate(`${config.basePath}/${a.id}/edit`)}
                onSnooze={
                  setAccounts
                    ? (id, until) =>
                        setAccounts((prev) => prev.map((x) => (x.id === id ? { ...x, snoozeUntil: until } : x)))
                    : null
                }
                onSheet={(info) => info && setSheet(info)}
              />
            ))}
          </div>
        )}
        {shown.length > 0 && (
          <div className="av-hint">Tap to open · Double-tap to edit · Hold for full details</div>
        )}
      </div>

      <button className="av-fab" onClick={() => navigate(`${config.basePath}/new`)} aria-label={`Add ${config.singular}`}>
        +
      </button>

      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */
export function AccountDetail({ config, accounts, setAccounts }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { id } = useParams();
  const [sheet, setSheet] = useState(null); // { title, actions }
  const account = accounts.find((a) => String(a.id) === id);

  if (!account) {
    return (
      <div className="av-page">
        <Header onBack={() => goBack(config.basePath)} title={config.singular} />
        <div className="av-empty">{config.singular} not found.</div>
      </div>
    );
  }

  const contacts = account.contacts || [];
  const days = account[config.visitDaysField] || [];
  const noteCount = (account.notes || []).length;
  const latest = lastNote(account);
  const visit = visitSummary(account, config);
  const mainContact = contacts.find((c) => c.name || c.title);
  const reachableContacts = contacts.filter(canReach);

  const openCallText = () => {
    const sheetInfo = contactSheet(contacts);
    if (sheetInfo) setSheet(sheetInfo);
  };

  return (
    <div className="av-page">
      <Header
        onBack={() => goBack(config.basePath)}
        title=""
        right={
          <button className="av-link-btn" onClick={() => navigate(`${config.basePath}/${account.id}/edit`)}>
            Edit
          </button>
        }
      />

      <div className="av-content">
        {/* Summary card: who, last note, visit schedule, quick buttons */}
        <div className="av-group av-summary">
          <div className="av-summary-top">
            <Avatar name={account.name} size={48} />
            <div className="av-summary-text">
              <div className={`av-summary-name ${account.name && account.name.trim() ? '' : 'is-blank'}`}>
                {displayName(account)}
              </div>
              <div className="av-summary-sub">
                {mainContact
                  ? [mainContact.name, mainContact.title].filter(Boolean).join(' · ')
                  : 'No contact yet'}
                {config.hasAccountNumber && account.accountNumber ? ` · #${account.accountNumber}` : ''}
              </div>
            </div>
            <span className="av-badge">{config.singular}</span>
          </div>

          <BackgroundBox notes={backgroundNotes(account)} onClick={() => navigate(config.notesPath(account.id))} />
          {latest && (
            <button className="av-last-note" onClick={() => navigate(config.notesPath(account.id))}>
              <span className="av-last-note-date">{shortDate(latest.timestamp)}</span>
              {latest.text}
            </button>
          )}

          <div className="av-chips av-summary-chips">
            {visit ? (
              <>
                <span className="av-chip av-chip-blue">{visit}</span>
                <span className="av-chip av-chip-gray">{shortFrequency(account.visitFrequency)}</span>
              </>
            ) : (
              <span className="av-chip av-chip-orange">No visit set</span>
            )}
            {config.hasStage && <StageChip stage={account.stage} />}
            <SnoozeChip account={account} />
          </div>

          <div className="av-quick">
            <button className="av-quick-btn" disabled={reachableContacts.length === 0} onClick={openCallText}>
              Contact
            </button>
            <button
              className="av-quick-btn"
              disabled={!account.address}
              onClick={() => setSheet({ title: account.address, actions: mapActions(account.address) })}
            >
              Map
            </button>
            {setAccounts && hasVisitDays(account, config) && (
              <button
                className="av-quick-btn"
                onClick={() =>
                  setSheet(
                    snoozeSheet(account, (until) =>
                      setAccounts((prev) => prev.map((x) => (x.id === account.id ? { ...x, snoozeUntil: until } : x)))
                    )
                  )
                }
              >
                {isSnoozed(account) ? 'Snoozed' : 'Snooze'}
              </button>
            )}
            <button className="av-quick-btn" onClick={() => navigate(config.notesPath(account.id))}>
              + Note
            </button>
          </div>
        </div>

        {account.address && (
          <div className="av-group">
            <button className="av-row" onClick={() => setSheet({ title: account.address, actions: mapActions(account.address) })}>
              <FaMapMarkerAlt className="av-row-icon" />
              <span className="av-row-text">
                <span className="av-row-label">Address</span>
                <span className="av-row-value av-blue">{account.address}</span>
              </span>
            </button>
          </div>
        )}

        <div className="av-section-title">Contacts</div>
        {contacts.length === 0 ? (
          <div className="av-group av-muted-row">No contacts yet.</div>
        ) : (
          contacts.map((c, i) => (
            <div key={i} className="av-group av-contact">
              <div className="av-contact-head">
                <span className="av-contact-name">{c.name || '(No name)'}</span>
                {c.title && <span className="av-contact-title">{c.title}</span>}
              </div>
              {c.phone && (
                <button className="av-row" onClick={() => setSheet({ title: c.name || c.phone, actions: contactActions(c) })}>
                  <FaPhoneAlt className="av-row-icon" />
                  <span className="av-row-text">
                    {c.textPhone && c.textPhone !== c.phone && <span className="av-row-label">Phone</span>}
                    <span className="av-row-value av-blue">{c.phone}</span>
                  </span>
                </button>
              )}
              {c.textPhone && c.textPhone !== c.phone && (
                <button className="av-row" onClick={() => setSheet({ title: c.name || c.textPhone, actions: contactActions(c) })}>
                  <FaPhoneAlt className="av-row-icon" />
                  <span className="av-row-text">
                    <span className="av-row-label">Cell (texts)</span>
                    <span className="av-row-value av-blue">{c.textPhone}</span>
                  </span>
                </button>
              )}
              {c.email && (
                <a className="av-row" href={`mailto:${c.email}`}>
                  <FaEnvelope className="av-row-icon" />
                  <span className="av-row-value av-blue">{c.email}</span>
                </a>
              )}
            </div>
          ))
        )}

        <div className="av-section-title">Visit schedule</div>
        <div className="av-days">
          {DAYS.map((d) => (
            <span key={d} className={`av-day ${days.includes(d) ? 'is-on' : ''}`}>{d}</span>
          ))}
        </div>
        {days.length > 0 && (
          <div className="av-group">
            <div className="av-row av-static-row">
              <span className="av-row-label-inline">Usual time</span>
              <span className="av-row-value">
                {typeof account.visitTime === 'number' ? timeLabel(account.visitTime) : 'Not set'}
              </span>
            </div>
            <div className="av-row av-static-row">
              <span className="av-row-label-inline">How often</span>
              <span className="av-row-value">{frequencyLabel(account.visitFrequency)}</span>
            </div>
            {account.visitFrequency && account.visitFrequency !== 'weekly' && account.visitStart && (
              <div className="av-row av-static-row">
                <span className="av-row-label-inline">Starting</span>
                <span className="av-row-value">
                  {new Date(account.visitStart + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="av-group">
          <button className="av-row" onClick={() => navigate(config.notesPath(account.id))}>
            <span className="av-row-text">
              <span className="av-row-value">Notes</span>
            </span>
            <span className="av-row-count">{noteCount}</span>
            <FaChevronRight className="av-row-chevron" />
          </button>
        </div>
      </div>

      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add / Edit                                                          */
/* ------------------------------------------------------------------ */
const BLANK_CONTACT = { title: '', name: '', phone: '', textPhone: '', email: '' };

export function AccountEdit({ config, accounts, setAccounts, isNew = false }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { id } = useParams();
  const existing = isNew ? null : accounts.find((a) => String(a.id) === id);

  const [name, setName] = useState(existing ? existing.name || '' : '');
  const [address, setAddress] = useState(existing ? existing.address || '' : '');
  const [accountNumber, setAccountNumber] = useState(existing ? existing.accountNumber || '' : '');
  const [contacts, setContacts] = useState(
    existing && existing.contacts ? existing.contacts.map((c) => ({ ...BLANK_CONTACT, ...c })) : []
  );
  const [days, setDays] = useState(
    existing && existing[config.visitDaysField] ? [...existing[config.visitDaysField]] : []
  );
  const [visitTime, setVisitTime] = useState(
    existing && typeof existing.visitTime === 'number' ? existing.visitTime : ''
  );
  const [visitFrequency, setVisitFrequency] = useState((existing && existing.visitFrequency) || 'weekly');
  const [visitStart, setVisitStart] = useState((existing && existing.visitStart) || todayKey());
  const [stage, setStage] = useState((existing && existing.stage) || '');
  const [showInItinerary, setShowInItinerary] = useState(!(existing && existing.showInItinerary === false));
  const [showOnCalendar, setShowOnCalendar] = useState(!(existing && existing.showOnCalendar === false));

  if (!isNew && !existing) {
    return (
      <div className="av-page">
        <Header onBack={() => goBack(config.basePath)} title={config.singular} />
        <div className="av-empty">{config.singular} not found.</div>
      </div>
    );
  }

  const cancel = () => goBack(isNew ? config.basePath : `${config.basePath}/${id}`);

  const changeContact = (index, field, value) =>
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));

  const toggleDay = (d) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const save = () => {
    if (!name.trim()) {
      window.alert(`Add a ${config.singular.toLowerCase()} name first.`);
      return;
    }
    const fields = {
      name: name.trim(),
      address: address.trim(),
      // drop contact rows that were left completely empty
      contacts: contacts
        .map((c) => ({
          ...c, // keep anything else already saved on the contact
          title: c.title.trim(),
          name: c.name.trim(),
          phone: c.phone.trim(),
          textPhone: c.textPhone.trim(),
          email: c.email.trim(),
        }))
        .filter((c) => c.title || c.name || c.phone || c.textPhone || c.email),
      [config.visitDaysField]: DAYS.filter((d) => days.includes(d)),
      visitTime: visitTime === '' ? null : Number(visitTime),
      visitFrequency,
      visitStart: visitFrequency === 'weekly' ? null : visitStart,
    };
    if (config.hasStage) fields.stage = stage || null;
    fields.showInItinerary = showInItinerary;
    fields.showOnCalendar = showOnCalendar;
    if (config.hasAccountNumber) fields.accountNumber = accountNumber.trim();

    if (isNew) {
      const created = { id: Date.now(), ...fields, notes: [] };
      setAccounts((prev) => [...prev, created]);
      navigate(`${config.basePath}/${created.id}`, { replace: true });
    } else {
      // keep everything else on the record (notes, etc.)
      setAccounts((prev) => prev.map((a) => (a.id === existing.id ? { ...a, ...fields } : a)));
      goBack(`${config.basePath}/${id}`);
    }
  };

  const remove = () => {
    if (!window.confirm(`Delete ${displayName(existing)}? This also deletes its notes.`)) return;
    setAccounts((prev) => prev.filter((a) => a.id !== existing.id));
    goBack(config.basePath, 2); // skip the detail screen of the deleted account
  };

  return (
    <div className="av-page">
      <header className="av-header">
        <button className="av-link-btn" onClick={cancel}>Cancel</button>
        <div className="av-header-title">{isNew ? `New ${config.singular}` : `Edit ${config.singular}`}</div>
        <button className="av-link-btn av-bold" onClick={save}>Save</button>
      </header>

      <div className="av-content">
        <div className="av-group">
          <input
            className="av-input"
            placeholder={`${config.singular} name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={isNew}
          />
          {config.hasAccountNumber && (
            <input
              className="av-input"
              placeholder="Account number"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          )}
          <input
            className="av-input"
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        {config.hasStage && (
          <>
            <div className="av-section-title">Stage</div>
            <div className="av-stage-pick">
              {STAGES.map((st) => {
                const on = stage === st.key;
                return (
                  <button
                    key={st.key}
                    className={`av-stage-option ${on ? 'is-on' : ''}`}
                    style={on ? { background: st.color, color: '#fff', borderColor: st.color } : { color: st.color, borderColor: st.color }}
                    onClick={() => setStage(on ? '' : st.key)}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="av-section-title">Contacts</div>
        {contacts.map((c, i) => (
          <div key={i} className="av-group av-contact-edit">
            <button
              className="av-remove-contact"
              onClick={() => setContacts((prev) => prev.filter((_, j) => j !== i))}
              aria-label="Remove contact"
            >
              ×
            </button>
            <input className="av-input" placeholder="Name" value={c.name} onChange={(e) => changeContact(i, 'name', e.target.value)} />
            <input className="av-input" placeholder="Title (Chef, Owner, Manager…)" value={c.title} onChange={(e) => changeContact(i, 'title', e.target.value)} />
            <input className="av-input" placeholder="Phone (for calls)" type="tel" value={c.phone} onChange={(e) => changeContact(i, 'phone', e.target.value)} />
            <input className="av-input" placeholder="Cell for texts (if different)" type="tel" value={c.textPhone} onChange={(e) => changeContact(i, 'textPhone', e.target.value)} />
            <input className="av-input" placeholder="Email" type="email" value={c.email} onChange={(e) => changeContact(i, 'email', e.target.value)} />
          </div>
        ))}
        <button className="av-add-contact" onClick={() => setContacts((prev) => [...prev, { ...BLANK_CONTACT }])}>
          + Add contact
        </button>

        <div className="av-section-title">Visit schedule</div>
        <div className="av-days">
          {DAYS.map((d) => (
            <button key={d} className={`av-day av-day-btn ${days.includes(d) ? 'is-on' : ''}`} onClick={() => toggleDay(d)}>
              {d}
            </button>
          ))}
        </div>
        {days.length > 0 && (
          <div className="av-group">
            <label className="av-row av-static-row">
              <span className="av-row-label-inline">Usual time</span>
              <select className="av-select" value={visitTime} onChange={(e) => setVisitTime(e.target.value)}>
                <option value="">Not set</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{timeLabel(t)}</option>
                ))}
              </select>
            </label>
            <label className="av-row av-static-row">
              <span className="av-row-label-inline">How often</span>
              <select className="av-select" value={visitFrequency} onChange={(e) => setVisitFrequency(e.target.value)}>
                {FREQUENCIES.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </label>
            <label className="av-row av-static-row">
              <span className="av-row-label-inline">Show in itinerary</span>
              <input
                type="checkbox"
                className="av-switch"
                checked={showInItinerary}
                onChange={(e) => setShowInItinerary(e.target.checked)}
              />
            </label>
            <label className="av-row av-static-row">
              <span className="av-row-label-inline">Show on calendar</span>
              <input
                type="checkbox"
                className="av-switch"
                checked={showOnCalendar}
                onChange={(e) => setShowOnCalendar(e.target.checked)}
              />
            </label>
            {visitFrequency !== 'weekly' && (
              <label className="av-row av-static-row">
                <span className="av-row-label-inline">Starting</span>
                <input
                  type="date"
                  className="av-select"
                  value={visitStart}
                  onChange={(e) => e.target.value && setVisitStart(e.target.value)}
                />
              </label>
            )}
          </div>
        )}

        {!isNew && (
          <button className="av-delete" onClick={remove}>
            Delete {config.singular}
          </button>
        )}
      </div>
    </div>
  );
}
