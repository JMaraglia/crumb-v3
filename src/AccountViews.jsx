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

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
export const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', weeks: 1 },
  { key: '2w', label: 'Every 2 weeks', weeks: 2 },
  { key: '3w', label: 'Every 3 weeks', weeks: 3 },
  { key: '4w', label: 'Monthly (every 4 weeks)', weeks: 4 },
  { key: '8w', label: 'Every 2 months', weeks: 8 },
];

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

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);

function todayKey() {
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

// Newest note (notes are saved with a date/time string).
function lastNote(account) {
  const notes = account.notes || [];
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

function shortDate(timestamp) {
  const t = Date.parse(timestamp);
  if (!t) return '';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A record with nothing in it at all (left over from the old Add button).
function isEmptyRecord(a) {
  return (
    !(a.name && a.name.trim()) &&
    !(a.address && a.address.trim()) &&
    !(a.contacts || []).some((c) => c && (c.name || c.phone || c.email || c.title)) &&
    !(a.notes || []).length
  );
}

function displayName(account) {
  return account.name && account.name.trim() ? account.name : '(No name)';
}

// Bottom pop-up with choices (Call / Text, Apple Maps / Google Maps).
function ActionSheet({ title, actions, onClose }) {
  return (
    <div className="av-sheet-backdrop" onClick={onClose}>
      <div className="av-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="av-sheet-group">
          {title && <div className="av-sheet-title">{title}</div>}
          {actions.map((a) => (
            <a key={a.label} className="av-sheet-action" href={a.href} target={a.newTab ? '_blank' : undefined} rel="noreferrer" onClick={onClose}>
              {a.label}
            </a>
          ))}
        </div>
        <button className="av-sheet-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function mapActions(address) {
  const q = encodeURIComponent(address);
  return [
    { label: 'Apple Maps', href: `https://maps.apple.com/?q=${q}`, newTab: true },
    { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${q}`, newTab: true },
  ];
}

function phoneActions(phone) {
  const n = digitsOnly(phone);
  return [
    { label: `Call ${phone}`, href: `tel:${n}` },
    { label: `Text ${phone}`, href: `sms:${n}` },
  ];
}

// Call / Text pop-up for an account's contacts: one number goes straight to
// the choice; several numbers are all listed. Returns null if there are none.
function callTextSheet(contacts) {
  const withPhone = (contacts || []).filter((c) => c.phone);
  if (withPhone.length === 0) return null;
  if (withPhone.length === 1) {
    const c = withPhone[0];
    return { title: c.name || c.phone, actions: phoneActions(c.phone) };
  }
  return {
    title: 'Call or text',
    actions: withPhone.flatMap((c) =>
      phoneActions(c.phone).map((a) => ({ ...a, label: `${a.label.split(' ')[0]} ${c.name || c.phone}` }))
    ),
  };
}

const HOLD_MS = 500;      // hold a row this long to open the full screen
const HOLD_WIGGLE = 10;   // px a finger can move and still count as holding

// One prospect in the list. Tap: open/close the quick card in place.
// Hold: open the full screen.
function ListRow({ account: a, config, expanded, onToggle, onOpenFull, onSheet }) {
  const navigate = useNavigate();
  const hold = React.useRef(null);
  const visit = visitSummary(a, config);
  const latest = lastNote(a);
  const contacts = a.contacts || [];
  const mainContact = contacts.find((c) => c.name || c.title);
  const hasPhone = contacts.some((c) => c.phone);

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
            </span>
          )}
        </span>
        <FaChevronRight className={`av-row-chevron ${expanded ? 'is-open' : ''}`} />
      </button>

      {expanded && (
        <div className="av-expand">
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
          </div>
          <div className="av-quick">
            <button className="av-quick-btn" disabled={!hasPhone} onClick={() => onSheet(callTextSheet(contacts))}>
              Call / Text
            </button>
            <button
              className="av-quick-btn"
              disabled={!a.address}
              onClick={() => onSheet({ title: a.address, actions: mapActions(a.address) })}
            >
              Map
            </button>
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
export function AccountList({ config, accounts }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortAZ, setSortAZ] = useState(true);
  const [openId, setOpenId] = useState(null); // the one row that's opened up
  const [sheet, setSheet] = useState(null);   // Call/Text or Maps pop-up

  const q = search.trim().toLowerCase();
  const realAccounts = accounts.filter((a) => !isEmptyRecord(a)); // hide leftover blank records
  const shown = realAccounts
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
          <span className="av-count">
            {shown.length} {shown.length === 1 ? config.singular.toLowerCase() : config.plural.toLowerCase()}
          </span>
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
                onSheet={(info) => info && setSheet(info)}
              />
            ))}
          </div>
        )}
        {shown.length > 0 && <div className="av-hint">Tap to open · Hold for full details</div>}
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
export function AccountDetail({ config, accounts }) {
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
  const phoneContacts = contacts.filter((c) => c.phone);

  const openCallText = () => {
    const sheetInfo = callTextSheet(contacts);
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
          </div>

          <div className="av-quick">
            <button className="av-quick-btn" disabled={phoneContacts.length === 0} onClick={openCallText}>
              Call / Text
            </button>
            <button
              className="av-quick-btn"
              disabled={!account.address}
              onClick={() => setSheet({ title: account.address, actions: mapActions(account.address) })}
            >
              Map
            </button>
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
                <button className="av-row" onClick={() => setSheet({ title: c.name || c.phone, actions: phoneActions(c.phone) })}>
                  <FaPhoneAlt className="av-row-icon" />
                  <span className="av-row-value av-blue">{c.phone}</span>
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
const BLANK_CONTACT = { title: '', name: '', phone: '', email: '' };

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
        .map((c) => ({ title: c.title.trim(), name: c.name.trim(), phone: c.phone.trim(), email: c.email.trim() }))
        .filter((c) => c.title || c.name || c.phone || c.email),
      [config.visitDaysField]: DAYS.filter((d) => days.includes(d)),
      visitTime: visitTime === '' ? null : Number(visitTime),
      visitFrequency,
      visitStart: visitFrequency === 'weekly' ? null : visitStart,
    };
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
            <input className="av-input" placeholder="Phone" type="tel" value={c.phone} onChange={(e) => changeContact(i, 'phone', e.target.value)} />
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
