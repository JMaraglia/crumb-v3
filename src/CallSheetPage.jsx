// file: src/CallSheetPage.jsx
// Call Sheet: which customers ORDER on each day, in a spreadsheet-style grid,
// so whoever covers for you knows who to call, how, and what to know.
// Order day = the day before a delivery day (Monday delivery → Sunday order).
// Share as a formatted Excel file (opens in Excel / Google Sheets / Numbers) or print / save as PDF.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { DAYS, ActionSheet, contactSheet, TIME_OPTIONS, timeLabel, formatPhone } from './AccountViews';
import { makeXlsx } from './xlsx';
import './CallSheetPage.css';

const FULL_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

// The day after `day` (Sun → Mon)
function nextDay(day) {
  return DAYS[(DAYS.indexOf(day) + 1) % 7];
}

const ORDERED_KEY = 'crumb_callsheet_ordered'; // { 'YYYY-MM-DD': [customerId, ...] }

function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The date of `day` in THIS week (Mon–Sun), e.g. Tue → Nov 3
function dateThisWeek(day) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + DAYS.indexOf(day));
}

function readOrdered() {
  try {
    const v = JSON.parse(localStorage.getItem(ORDERED_KEY));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
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
  if (c.phone) parts.push(formatPhone(c.phone));
  if (c.textPhone && c.textPhone !== c.phone) parts.push(`text ${formatPhone(c.textPhone)}`);
  return parts.join(' / ');
}

// One row per customer that orders on `orderDay`.
function rowsFor(customers, orderDay, orderedIds = []) {
  const delivers = nextDay(orderDay);
  return customers
    .filter((c) => c.name && c.name.trim() && (c.deliveryDays || []).includes(delivers))
    // In calling order: by "Call at" time, then name; no time set next; N/A (no call) last.
    .sort((a, b) => {
      const rank = (c) => (typeof c.callTime === 'number' ? c.callTime : c.callTime === 'na' ? 20000 : 10000);
      const ta = rank(a);
      const tb = rank(b);
      return ta - tb || a.name.localeCompare(b.name);
    })
    .map((c) => {
      const contact = mainContact(c);
      return {
        account: c,
        name: c.name,
        number: c.accountNumber || '',
        contact: contact ? [contact.name, contact.title].filter(Boolean).join(', ') : '',
        phone: phoneText(contact),
        callTime: typeof c.callTime === 'number' || c.callTime === 'na' ? c.callTime : null,
        callAt: typeof c.callTime === 'number' ? timeLabel(c.callTime) : c.callTime === 'na' ? 'N/A' : '',
        noCall: c.callTime === 'na',
        online: Boolean(c.onlineOrdering),
        onlineText: c.onlineOrdering ? 'Yes' : 'No',
        ordered: orderedIds.includes(c.id),
        orderedText: orderedIds.includes(c.id) ? 'Yes' : 'No',
        callNote: c.callNote || '',
      };
    });
}

const COLUMNS = [
  { key: 'number', label: 'Acct #' },
  { key: 'name', label: 'Account' },
  { key: 'contact', label: 'Contact' },
  { key: 'phone', label: 'Phone' },
  { key: 'callAt', label: 'Call at' },
  { key: 'onlineText', label: 'Online ordering' },
  { key: 'callNote', label: 'Call notes' },
  { key: 'orderedText', label: 'Ordered' },
];

// Column widths (in Excel's "characters") for the shared spreadsheet
const XLSX_COLUMNS = [
  { label: 'Acct #', width: 13, kind: 'quiet' },
  { label: 'Account', width: 28, kind: 'bold' },
  { label: 'Contact', width: 22 },
  { label: 'Phone', width: 21 },
  { label: 'Call at', width: 11 },
  { label: 'Online', width: 10, kind: 'check' },
  { label: 'Call notes', width: 40 },
  { label: 'Ordered', width: 11, kind: 'check' },
];

// Order days that get a tab in the shared file, in tab order
const SHARE_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// One Excel file, one tab per order day (Sunday–Friday). Opens on `currentDay`'s tab.
function toWeekXlsx(customers, orderedMap, currentDay) {
  const sheets = SHARE_DAYS.map((orderDay) => {
    const date = dateThisWeek(orderDay);
    const dateText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const rows = rowsFor(customers, orderDay, orderedMap[keyOf(date)] || []);
    return {
      name: FULL_DAY[orderDay],
      title: 'Crumb. Call Sheet',
      subtitle: `${FULL_DAY[orderDay]}, ${dateText} · Orders for ${FULL_DAY[nextDay(orderDay)]} delivery · ${rows.length} ${
        rows.length === 1 ? 'account' : 'accounts'
      }`,
      columns: XLSX_COLUMNS,
      rows: rows.map((r) => ({
        cells: [r.number, r.name, r.contact, r.phone, r.callAt, r.online, r.callNote, r.ordered],
      })),
      emptyText: `No customers order on ${FULL_DAY[orderDay]}.`,
    };
  });
  return makeXlsx({ sheets, activeSheet: Math.max(0, SHARE_DAYS.indexOf(currentDay)) });
}

export default function CallSheetPage({ contacts = [], setContacts }) {
  const navigate = useNavigate();
  const [day, setDay] = useState(todayShort());
  const [sheet, setSheet] = useState(null);
  const [orderedMap, setOrderedMap] = useState(readOrdered);
  const dateKeyForDay = keyOf(dateThisWeek(day));
  const dateText = dateThisWeek(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const orderedIds = orderedMap[dateKeyForDay] || [];

  // Ordered checkmarks are kept per date, so next week starts unchecked.
  const toggleOrdered = (id) => {
    const list = orderedMap[dateKeyForDay] || [];
    const nextList = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    const next = { ...orderedMap, [dateKeyForDay]: nextList };
    setOrderedMap(next);
    localStorage.setItem(ORDERED_KEY, JSON.stringify(next));
  };
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null); // { id, name, text } while editing a call note

  // Change one customer right from the sheet (call time, online ordering)
  const updateCustomer = (id, patch) => {
    if (setContacts) setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const saveCallNote = () => {
    if (setContacts) {
      setContacts((prev) =>
        prev.map((c) => (c.id === editing.id ? { ...c, callNote: editing.text.trim() } : c))
      );
    }
    setEditing(null);
  };
  const rows = rowsFor(contacts, day, orderedIds);
  const anyCustomers = SHARE_DAYS.some((d) => rowsFor(contacts, d).length > 0);
  const orderedCount = rows.filter((r) => r.ordered).length;

  const shareCSV = async () => {
    setMessage('');
    const weekOf = dateThisWeek('Mon').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fileName = `Crumb call sheet - week of ${weekOf}.xlsx`;
    const blob = toWeekXlsx(contacts, orderedMap, day);
    try {
      const file = new File([blob], fileName, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // closed the share sheet
    }
    // Fallback: download the file
    const url = URL.createObjectURL(blob);
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
          <strong>
            {FULL_DAY[day]}, {dateText} orders
          </strong>{' '}
          · deliver {FULL_DAY[nextDay(day)]}
          {rows.length > 0 && (
            <span className="cs-progress">
              {' '}
              · {orderedCount} of {rows.length} ordered
            </span>
          )}
        </div>

        <div className="cs-actions">
          <button className="cs-btn" disabled={!anyCustomers} onClick={shareCSV}>
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
              <div className="cs-print-brand">Crumb.</div>
              <div className="cs-print-heading">Call Sheet</div>
              <div className="cs-print-sub">
                {FULL_DAY[day]}, {dateText} · Orders for {FULL_DAY[nextDay(day)]} delivery · {rows.length}{' '}
                {rows.length === 1 ? 'account' : 'accounts'}
              </div>
            </div>
            <table className="cs-table">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key}>{c.key === 'onlineText' ? 'Online' : c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.account.id} className={r.noCall ? 'is-no-call' : ''}>
                    <td>{r.number}</td>
                    <td className="cs-name">
                      <button className="cs-link" onClick={() => navigate(`/customers/${r.account.id}`)}>
                        {r.name}
                      </button>
                    </td>
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
                    <td>
                      <select
                        className={`cs-time ${r.callTime == null ? 'is-empty' : ''}`}
                        value={r.callTime == null ? '' : r.callTime}
                        onChange={(e) =>
                          updateCustomer(r.account.id, {
                            callTime:
                              e.target.value === '' ? null : e.target.value === 'na' ? 'na' : Number(e.target.value),
                          })
                        }
                      >
                        <option value="">Set time</option>
                        <option value="na">N/A (no call)</option>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{timeLabel(t)}</option>
                        ))}
                      </select>
                      <span className="cs-print-only">{r.callAt}</span>
                    </td>
                    <td className="cs-center">
                      <input
                        type="checkbox"
                        className="cs-check"
                        checked={r.online}
                        onChange={(e) => updateCustomer(r.account.id, { onlineOrdering: e.target.checked })}
                        aria-label="Uses online ordering"
                      />
                      <span className="cs-print-only">{r.online ? '☑' : '☐'}</span>
                    </td>
                    <td className="cs-wide">
                      <button
                        className={`cs-note ${r.callNote ? '' : 'is-empty'}`}
                        onClick={() => setEditing({ id: r.account.id, name: r.name, text: r.callNote })}
                      >
                        {r.callNote || '+ Add call note'}
                      </button>
                    </td>
                    <td className="cs-center">
                      <input
                        type="checkbox"
                        className="cs-check cs-ordered"
                        checked={r.ordered}
                        onChange={() => toggleOrdered(r.account.id)}
                        aria-label="Ordered"
                      />
                      <span className="cs-print-only">{r.ordered ? '☑' : '☐'}</span>
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
