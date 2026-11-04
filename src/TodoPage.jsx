// file: src/TodoPage.jsx
// To-Do: your own tasks + every open Follow-up note from customers and prospects (filled in automatically).
// Checking a follow-up here checks it in the account's notes too (same note, nothing copied).
// Tasks are saved under crumb_todos: [{ id, text, due: 'YYYY-MM-DD' | null, done, doneAt,
//   createdAt, accountType: 'customer' | 'prospect' | null, accountId, accountName }]
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline, IoChevronDown, IoChevronForward } from 'react-icons/io5';
import { normalizeCategory } from './NotesView';
import { shareText } from './share';
import './TodoPage.css';

const TODOS_KEY = 'crumb_todos';

function readTodos() {
  try {
    const v = JSON.parse(localStorage.getItem(TODOS_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const keyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (k, n) => {
  const [y, m, d] = k.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
};
const niceDue = (k, today) => {
  if (!k) return '';
  if (k === today) return 'Today';
  if (k === addDays(today, 1)) return 'Tomorrow';
  if (k === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = k.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
};
const hasName = (a) => a && a.name && a.name.trim();

export default function TodoPage({ contacts = [], setContacts, prospects = [], setProspects }) {
  const navigate = useNavigate();
  const today = keyOf(new Date());
  const [todos, setTodos] = useState(readTodos);
  const [text, setText] = useState('');
  const [due, setDue] = useState(null); // due date for the task being typed
  const [editing, setEditing] = useState(null); // item being edited
  const [showDone, setShowDone] = useState(false);
  const [message, setMessage] = useState('');

  const saveTodos = (next) => {
    setTodos(next);
    localStorage.setItem(TODOS_KEY, JSON.stringify(next));
  };

  /* ---- everything on the list ---- */
  const items = [];
  todos.forEach((t) =>
    items.push({
      key: `t-${t.id}`,
      kind: 'task',
      id: t.id,
      text: t.text,
      due: t.due || null,
      done: Boolean(t.done),
      doneAt: t.doneAt || null,
      accountType: t.accountType || null,
      accountId: t.accountId ?? null,
      accountName: t.accountName || '',
    })
  );
  const collectFollowUps = (list, type) =>
    list.filter(hasName).forEach((acct) =>
      (acct.notes || []).forEach((n, index) => {
        if (normalizeCategory(n.category) !== 'Follow-up') return;
        items.push({
          key: `f-${type}-${acct.id}-${index}`,
          kind: 'followup',
          index,
          text: n.text,
          due: n.due || null,
          done: Boolean(n.done),
          doneAt: n.doneAt || null,
          created: n.timestamp,
          accountType: type,
          accountId: acct.id,
          accountName: acct.name,
        });
      })
    );
  collectFollowUps(contacts, 'customer');
  collectFollowUps(prospects, 'prospect');

  const open = items.filter((i) => !i.done);
  const byDue = (a, b) => (a.due || '9999') .localeCompare(b.due || '9999') || a.text.localeCompare(b.text);
  const sections = [
    { title: 'Overdue', tone: 'red', list: open.filter((i) => i.due && i.due < today).sort(byDue) },
    { title: 'Today', tone: 'blue', list: open.filter((i) => i.due === today).sort(byDue) },
    { title: 'Upcoming', tone: 'gray', list: open.filter((i) => i.due && i.due > today).sort(byDue) },
    { title: 'No date', tone: 'gray', list: open.filter((i) => !i.due).sort((a, b) => a.accountName.localeCompare(b.accountName)) },
  ];
  const doneList = items
    .filter((i) => i.done)
    .sort((a, b) => (Date.parse(b.doneAt) || 0) - (Date.parse(a.doneAt) || 0))
    .slice(0, 50);

  /* ---- changes ---- */
  const updateNote = (item, patch) => {
    const apply = (list) =>
      list.map((a) => {
        if (a.id !== item.accountId) return a;
        const notes = [...(a.notes || [])];
        notes[item.index] = { ...notes[item.index], ...patch };
        return { ...a, notes };
      });
    if (item.accountType === 'prospect' && setProspects) setProspects(apply);
    if (item.accountType === 'customer' && setContacts) setContacts(apply);
  };

  const toggle = (item) => {
    const patch = { done: !item.done, doneAt: !item.done ? new Date().toISOString() : null };
    if (item.kind === 'task') saveTodos(todos.map((t) => (t.id === item.id ? { ...t, ...patch } : t)));
    else updateNote(item, patch);
  };

  const add = () => {
    const t = text.trim();
    if (!t) return;
    saveTodos([
      ...todos,
      { id: Date.now(), text: t, due, done: false, doneAt: null, createdAt: new Date().toISOString(), accountType: null, accountId: null, accountName: '' },
    ]);
    setText('');
    setDue(null);
  };

  const saveEdit = (changes) => {
    const item = editing;
    if (item.kind === 'task') {
      saveTodos(todos.map((t) => (t.id === item.id ? { ...t, ...changes } : t)));
    } else {
      updateNote(item, { due: changes.due || null });
    }
    setEditing(null);
  };

  const removeTask = (item) => {
    if (!window.confirm('Delete this task?')) return;
    saveTodos(todos.filter((t) => t.id !== item.id));
    setEditing(null);
  };

  const share = async () => {
    const lines = ['To-Do'];
    sections.forEach((s) => {
      if (!s.list.length) return;
      lines.push('', s.title.toUpperCase());
      s.list.forEach((i) => {
        const extra = [i.due && s.title !== 'Today' ? niceDue(i.due, today) : '', i.accountName].filter(Boolean).join(' · ');
        lines.push(`☐ ${i.text}${extra ? ` (${extra})` : ''}`);
      });
    });
    setMessage(await shareText('To-Do', lines.join('\n')));
  };

  const openAccount = (item) =>
    navigate(item.accountType === 'prospect' ? `/prospects/${item.accountId}` : `/customers/${item.accountId}`);

  const Row = ({ item, tone }) => (
    <div className={`td-row ${item.done ? 'is-done' : ''}`}>
      <button className={`td-check ${item.done ? 'is-checked' : ''}`} onClick={() => toggle(item)} aria-label={item.done ? 'Mark not done' : 'Mark done'}>
        {item.done ? '✓' : ''}
      </button>
      <button className="td-main" onClick={() => setEditing(item)}>
        <span className="td-text">{item.text}</span>
        <span className="td-meta">
          {item.kind === 'followup' && <span className="td-tag">Follow-up</span>}
          {item.accountName && <span className={`td-acct ${item.accountType}`}>{item.accountName}</span>}
          {item.due && !item.done && tone !== 'blue' && (
            <span className={`td-due ${tone === 'red' ? 'is-late' : ''}`}>{niceDue(item.due, today)}</span>
          )}
        </span>
      </button>
    </div>
  );

  return (
    <div className="td-page">
      <header className="td-header">
        <button className="td-icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <FaArrowLeft />
        </button>
        <span />
        <span />
      </header>

      <div className="td-content">
        <div className="td-title-row">
          <h1 className="td-title">To-Do</h1>
          <button className="td-pill" disabled={!open.length} onClick={share}>
            <IoShareOutline className="td-pill-icon" />
            Share
          </button>
        </div>
        {message && <div className="td-message">{message}</div>}

        {/* Add a task */}
        <div className="td-add">
          <input
            className="td-add-input"
            placeholder="Add a task…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <div className="td-add-row">
            {[
              ['Today', today],
              ['Tomorrow', addDays(today, 1)],
            ].map(([label, k]) => (
              <button key={label} className={`td-chip ${due === k ? 'is-on' : ''}`} onClick={() => setDue(due === k ? null : k)}>
                {label}
              </button>
            ))}
            <label className={`td-chip td-chip-date ${due && due !== today && due !== addDays(today, 1) ? 'is-on' : ''}`}>
              {due && due !== today && due !== addDays(today, 1) ? niceDue(due, today) : 'Pick date'}
              <input type="date" className="td-date-hidden" value={due || ''} onChange={(e) => setDue(e.target.value || null)} />
            </label>
            <span className="td-spacer" />
            <button className="td-add-btn" disabled={!text.trim()} onClick={add}>
              Add
            </button>
          </div>
        </div>

        {open.length === 0 && (
          <div className="td-empty">
            Nothing to do. 🎉
            <br />
            Add a task above, or label a note <strong>Follow-up</strong> and it shows up here.
          </div>
        )}

        {sections.map((s) =>
          s.list.length ? (
            <div key={s.title} className="td-section">
              <div className={`td-section-title tone-${s.tone}`}>
                {s.title} <span className="td-count">{s.list.length}</span>
              </div>
              <div className="td-list">
                {s.list.map((item) => (
                  <Row key={item.key} item={item} tone={s.tone} />
                ))}
              </div>
            </div>
          ) : null
        )}

        {doneList.length > 0 && (
          <div className="td-section">
            <button className="td-done-toggle" onClick={() => setShowDone(!showDone)}>
              {showDone ? <IoChevronDown /> : <IoChevronForward />} Done <span className="td-count">{doneList.length}</span>
            </button>
            {showDone && (
              <div className="td-list">
                {doneList.map((item) => (
                  <Row key={item.key} item={item} />
                ))}
              </div>
            )}
          </div>
        )}
        <div className="td-hint">Tap the circle when it's done · Tap a task to change it</div>
      </div>

      {editing && (
        <EditSheet
          item={editing}
          today={today}
          accounts={[
            ...contacts.filter(hasName).map((a) => ({ type: 'customer', id: a.id, name: a.name })),
            ...prospects.filter(hasName).map((a) => ({ type: 'prospect', id: a.id, name: a.name })),
          ]}
          onSave={saveEdit}
          onDelete={() => removeTask(editing)}
          onOpenAccount={() => openAccount(editing)}
          onOpenNotes={() =>
            navigate(editing.accountType === 'prospect' ? `/prospect-notes/${editing.accountId}` : `/notes/${editing.accountId}`)
          }
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ---------- Change a task (or a follow-up's due date) ---------- */
function EditSheet({ item, today, accounts, onSave, onDelete, onOpenAccount, onOpenNotes, onCancel }) {
  const isTask = item.kind === 'task';
  const [text, setText] = useState(item.text);
  const [due, setDue] = useState(item.due || '');
  const [acct, setAcct] = useState(
    item.accountId != null && item.accountType ? { type: item.accountType, id: item.accountId, name: item.accountName } : null
  );
  const [search, setSearch] = useState('');
  const matches = search.trim()
    ? accounts.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 5)
    : [];

  const save = () =>
    onSave(
      isTask
        ? {
            text: text.trim() || item.text,
            due: due || null,
            accountType: acct ? acct.type : null,
            accountId: acct ? acct.id : null,
            accountName: acct ? acct.name : '',
          }
        : { due: due || null }
    );

  return (
    <div className="td-sheet-backdrop" onClick={onCancel}>
      <div className="td-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="td-sheet-top">
          <button className="td-link" onClick={onCancel}>Cancel</button>
          <div className="td-sheet-title">{isTask ? 'Task' : 'Follow-up'}</div>
          <button className="td-link td-bold" onClick={save}>Save</button>
        </div>

        <div className="td-sheet-group">
          {isTask ? (
            <textarea className="td-sheet-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <div className="td-sheet-note">
              <div className="td-sheet-note-text">{item.text}</div>
              <div className="td-sheet-note-sub">From {item.accountName}'s notes. Change the wording there.</div>
            </div>
          )}
          <label className="td-sheet-row">
            <span>Due</span>
            <span className="td-sheet-due">
              {due && <button className="td-clear" onClick={() => setDue('')}>Clear</button>}
              <input type="date" className="td-sheet-date" value={due} onChange={(e) => setDue(e.target.value)} />
            </span>
          </label>
          {isTask && (
            <div className="td-sheet-row td-sheet-acct">
              <span>Account</span>
              {acct ? (
                <span className="td-picked">
                  {acct.name}
                  <button className="td-picked-x" onClick={() => setAcct(null)} aria-label="Remove">×</button>
                </span>
              ) : (
                <input
                  className="td-acct-search"
                  placeholder="Link a customer or prospect"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
            </div>
          )}
          {isTask &&
            !acct &&
            matches.map((a) => (
              <button
                key={`${a.type}-${a.id}`}
                className="td-match"
                onClick={() => {
                  setAcct(a);
                  setSearch('');
                }}
              >
                {a.name} <span className="td-match-kind">{a.type === 'prospect' ? 'Prospect' : 'Customer'}</span>
              </button>
            ))}
        </div>

        <div className="td-sheet-actions">
          {item.accountId != null && item.accountType && (
            <button className="td-sheet-btn" onClick={item.kind === 'followup' ? onOpenNotes : onOpenAccount}>
              {item.kind === 'followup' ? `Open ${item.accountName}'s notes` : `Open ${item.accountName}`}
            </button>
          )}
          {isTask && (
            <button className="td-sheet-btn is-danger" onClick={onDelete}>
              Delete task
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
