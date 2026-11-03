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

  const q = search.trim().toLowerCase();
  const shown = accounts
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
      <Header onBack={() => navigate('/')} title={config.plural} />

      <div className="av-content">
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

        {accounts.length === 0 ? (
          <div className="av-empty">No {config.plural.toLowerCase()} yet. Tap + to add one.</div>
        ) : shown.length === 0 ? (
          <div className="av-empty">No matches.</div>
        ) : (
          <div className="av-group">
            {shown.map((a) => (
              <button key={a.id} className="av-row" onClick={() => navigate(`${config.basePath}/${a.id}`)}>
                <span className="av-row-text">
                  <span className={`av-row-name ${a.name && a.name.trim() ? '' : 'is-blank'}`}>{displayName(a)}</span>
                  {a.address && <span className="av-row-sub">{a.address}</span>}
                </span>
                <FaChevronRight className="av-row-chevron" />
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="av-fab" onClick={() => navigate(`${config.basePath}/new`)} aria-label={`Add ${config.singular}`}>
        +
      </button>
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
  const days = account.deliveryDays || [];
  const noteCount = (account.notes || []).length;

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
        <div className="av-hero">
          <div className={`av-hero-name ${account.name && account.name.trim() ? '' : 'is-blank'}`}>
            {displayName(account)}
          </div>
          <span className="av-badge">{config.singular}</span>
          {config.hasAccountNumber && account.accountNumber && (
            <div className="av-hero-sub">Account #{account.accountNumber}</div>
          )}
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

        <div className="av-section-title">{config.daysLabel}</div>
        <div className="av-days">
          {DAYS.map((d) => (
            <span key={d} className={`av-day ${days.includes(d) ? 'is-on' : ''}`}>{d}</span>
          ))}
        </div>

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
  const [days, setDays] = useState(existing && existing.deliveryDays ? [...existing.deliveryDays] : []);

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
      deliveryDays: DAYS.filter((d) => days.includes(d)),
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

        <div className="av-section-title">{config.daysLabel}</div>
        <div className="av-days">
          {DAYS.map((d) => (
            <button key={d} className={`av-day av-day-btn ${days.includes(d) ? 'is-on' : ''}`} onClick={() => toggleDay(d)}>
              {d}
            </button>
          ))}
        </div>

        {!isNew && (
          <button className="av-delete" onClick={remove}>
            Delete {config.singular}
          </button>
        )}
      </div>
    </div>
  );
}
