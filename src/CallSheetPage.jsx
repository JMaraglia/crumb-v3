// file: src/CallSheetPage.jsx
// Call Sheet: which customers ORDER on each day, in a spreadsheet-style grid,
// so whoever covers for you knows who to call, how, and what to know.
// Order day = the day before a delivery day (Monday delivery → Sunday order).
// Share as a CSV file (opens in Excel / Google Sheets) or print / save as PDF.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { DAYS, ActionSheet, contactSheet } from './AccountViews';
import './CallSheetPage.css';

const FULL_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

// The day after `day` (Sun → Mon)
function nextDay(day) {
  return DAYS[(DAYS.indexOf(day) + 1) % 7];
}

function todayShort() {
  return DAYS[(new Date().getDay() + 6) % 7]; // Mon=0 … Sun=6
}

function mainContact(account) {
  return (account.contacts || []).find((c) => c.name || c.phone || c.title) || null;
}

function phoneText(c) {
  if (!c) return '';
  const parts = [];
  if (c.phone) parts.push(c.phone);
  if (c.textPhone && c.textPhone !== c.phone) parts.push(`text ${c.textPhone}`);
  return parts.join(' / ');
}

// One row per customer that orders on `orderDay`.
function rowsFor(customers, orderDay) {
  const delivers = nextDay(orderDay);
  return customers
    .filter((c) => c.name && c.name.trim() && (c.deliveryDays || []).includes(delivers))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const contact = mainContact(c);
      return {
        account: c,
        name: c.name,
        number: c.accountNumber || '',
        contact: contact ? [contact.name, contact.title].filter(Boolean).join(', ') : '',
        phone: phoneText(contact),
        delivers: FULL_DAY[delivers],
        callNote: c.callNote || '',
      };
    });
}

const COLUMNS = [
  { key: 'name', label: 'Account' },
  { key: 'number', label: 'Acct #' },
  { key: 'contact', label: 'Contact' },
  { key: 'phone', label: 'Phone' },
  { key: 'delivers', label: 'Delivers' },
  { key: 'callNote', label: 'Call notes' },
];

function toCSV(rows, orderDay) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [
    [`Call sheet: ${FULL_DAY[orderDay]} orders (deliver ${FULL_DAY[nextDay(orderDay)]})`].map(esc).join(','),
    COLUMNS.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => COLUMNS.map((c) => esc(r[c.key])).join(',')),
  ];
  return '﻿' + lines.join('\r\n'); // ﻿ so Excel reads it as UTF-8
}

export default function CallSheetPage({ contacts = [], setContacts }) {
  const navigate = useNavigate();
  const [day, setDay] = useState(todayShort());
  const [sheet, setSheet] = useState(null);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null); // { id, name, text } while editing a call note

  const saveCallNote = () => {
    if (setContacts) {
      setContacts((prev) =>
        prev.map((c) => (c.id === editing.id ? { ...c, callNote: editing.text.trim() } : c))
      );
    }
    setEditing(null);
  };
  const rows = rowsFor(contacts, day);

  const shareCSV = async () => {
    setMessage('');
    const fileName = `Crumb call sheet - ${FULL_DAY[day]}.csv`;
    const csv = toCSV(rows, day);
    try {
      const file = new File([csv], fileName, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // closed the share sheet
    }
    // Fallback: download the file
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Spreadsheet downloaded.');
  };

  const printSheet = () => {
    setMessage('');
    try {
      window.print();
    } catch {
      setMessage("Printing isn't available here. Use Share spreadsheet instead.");
    }
  };

  return (
    <div className="cs-page">
      <header className="cs-header">
        <button className="cs-icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <FaArrowLeft />
        </button>
        <span />
        <span />
      </header>

      <div className="cs-content">
        <h1 className="cs-title">Call Sheet</h1>

        {/* Day switcher: the ORDER day */}
        <div className="cs-days">
          {DAYS.map((d) => (
            <button key={d} className={`cs-day ${d === day ? 'is-on' : ''}`} onClick={() => setDay(d)}>
              {d}
            </button>
          ))}
        </div>

        <div className="cs-subtitle">
          <strong>{FULL_DAY[day]} orders</strong> · deliver {FULL_DAY[nextDay(day)]} ·{' '}
          {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
        </div>

        <div className="cs-actions">
          <button className="cs-btn" disabled={!rows.length} onClick={shareCSV}>
            Share spreadsheet
          </button>
          <button className="cs-btn cs-btn-plain" disabled={!rows.length} onClick={printSheet}>
            Print / PDF
          </button>
        </div>
        {message && <div className="cs-message">{message}</div>}

        {rows.length === 0 ? (
          <div className="cs-empty">
            No customers order on {FULL_DAY[day]}.
            <br />
            Set <strong>Delivery days</strong> on a customer and they'll show up the day before.
          </div>
        ) : (
          <div className="cs-scroll">
            {/* Title only shows on the printed / PDF copy */}
            <div className="cs-print-title">
              Call sheet: {FULL_DAY[day]} orders (deliver {FULL_DAY[nextDay(day)]})
            </div>
            <table className="cs-table">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.account.id}>
                    <td className="cs-name">
                      <button className="cs-link" onClick={() => navigate(`/customers/${r.account.id}`)}>
                        {r.name}
                      </button>
                    </td>
                    <td>{r.number}</td>
                    <td>{r.contact}</td>
                    <td>
                      {r.phone ? (
                        <button
                          className="cs-link"
                          onClick={() => {
                            const info = contactSheet(r.account.contacts);
                            if (info) setSheet(info);
                          }}
                        >
                          {r.phone}
                        </button>
                      ) : (
                        ''
                      )}
                    </td>
                    <td>{r.delivers}</td>
                    <td className="cs-wide">
                      <button
                        className={`cs-note ${r.callNote ? '' : 'is-empty'}`}
                        onClick={() => setEditing({ id: r.account.id, name: r.name, text: r.callNote })}
                      >
                        {r.callNote || '+ Add call note'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && <div className="cs-hint">Swipe the grid sideways to see every column</div>}
      </div>

      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}

      {editing && (
        <div className="cs-sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cs-sheet-title">Call note · {editing.name}</div>
            <div className="cs-sheet-sub">Instructions for whoever makes this call. Stays until you change it.</div>
            <textarea
              className="cs-sheet-input"
              rows={4}
              placeholder="e.g. Text Phil in the morning to remind him, then call him at 3"
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              autoFocus
            />
            <div className="cs-sheet-actions">
              <button className="cs-sheet-cancel" onClick={() => setEditing(null)}>Cancel</button>
              <button className="cs-sheet-save" onClick={saveCallNote}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
