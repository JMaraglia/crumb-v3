// file: src/TodoPage.jsx
// To-Do: your own tasks + every open Follow-up and Sample note from customers and prospects (filled in automatically).
// Checking one here checks it in the account's notes too (same note, nothing copied).
// Tasks are saved under crumb_todos: [{ id, text, due: 'YYYY-MM-DD' | null, done, doneAt,
//   createdAt, accountType: 'customer' | 'prospect' | null, accountId, accountName }]
import React, { useRef, useState } from 'react';
import { collectTodoItems } from './todoItems';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline, IoChevronDown, IoChevronForward } from 'react-icons/io5';
import { shareText } from './share';
import { changeNote, dropNote, loadTodos, saveTodos as storeTodos } from './store';
import './TodoPage.css';
import { useCloudRefresh } from './useCloudRefresh';

// Saved through store.js (the front door).
const readTodos = loadTodos;

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
  useCloudRefresh(() => setTodos(readTodos())); // changes from your other device, re-read in place
  const [text, setText] = useState('');
  const [due, setDue] = useState(null); // due date for the task being typed
  const [editing, setEditing] = useState(null); // item being edited
  const [showDone, setShowDone] = useState(false);
  const [message, setMessage] = useState('');

  const saveTodos = (next) => {
    setTodos(next);
    storeTodos(next);
  };

  /* ---- everything on the list ---- */
  const items = collectTodoItems(todos, contacts, prospects);

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
        return { ...a, notes: changeNote(a.notes || [], { id: item.noteId, index: item.index }, patch) };
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

  // Swipe-to-delete. Tasks go right away (with Undo); follow-up/sample notes ask first.
  const [undo, setUndo] = useState(null); // { task, timer }
  const swipeDelete = (item) => {
    if (item.kind === 'task') {
      const task = todos.find((t) => t.id === item.id);
      saveTodos(todos.filter((t) => t.id !== item.id));
      if (undo && undo.timer) clearTimeout(undo.timer);
      const timer = setTimeout(() => setUndo(null), 6000);
      setUndo({ task, timer });
      return true;
    }
    if (!window.confirm(`Delete "${item.text}"?\nThis deletes the note from ${item.accountName}'s notes.`)) return false;
    const drop = (list) =>
      list.map((a) => (a.id === item.accountId ? { ...a, notes: dropNote(a.notes || [], { id: item.noteId, index: item.index }) } : a));
    if (item.accountType === 'prospect' && setProspects) setProspects(drop);
    if (item.accountType === 'customer' && setContacts) setContacts(drop);
    return true;
  };
  const undoDelete = () => {
    if (!undo) return;
    clearTimeout(undo.timer);
    saveTodos([...readTodos(), undo.task]);
    setUndo(null);
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

  const renderRow = (item, tone) => (
    <SwipeRow key={item.key} className={`td-row ${item.done ? 'is-done' : ''}`} onDelete={() => swipeDelete(item)}>
      <button className={`td-check ${item.done ? 'is-checked' : ''}`} onClick={() => toggle(item)} aria-label={item.done ? 'Mark not done' : 'Mark done'}>
        {item.done ? '✓' : ''}
      </button>
      <button className="td-main" onClick={() => setEditing(item)}>
        <span className="td-text">{item.text}</span>
        <span className="td-meta">
          {item.kind === 'followup' && (
            <span className={`td-tag ${item.label === 'Sample' ? 'is-sample' : ''}`}>{item.label}</span>
          )}
          {item.accountName && <span className={`td-acct ${item.accountType}`}>{item.accountName}</span>}
          {item.due && !item.done && tone !== 'blue' && (
            <span className={`td-due ${tone === 'red' ? 'is-late' : ''}`}>{niceDue(item.due, today)}</span>
          )}
        </span>
      </button>
    </SwipeRow>
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
            Add a task above, or label a note <strong>Follow-up</strong> or <strong>Sample</strong> and it shows up here.
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
                  renderRow(item, s.tone)
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
                  renderRow(item)
                ))}
              </div>
            )}
          </div>
        )}
        <div className="td-hint">Tap the circle when it's done · Tap to change · Swipe left to delete</div>
      </div>

      {undo && (
        <div className="td-undo">
          <span>Task deleted</span>
          <button className="td-undo-btn" onClick={undoDelete}>
            Undo
          </button>
        </div>
      )}

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

/* ---------- A row you can swipe left to delete (like iPhone lists) ---------- */
const DELETE_W = 88;
function SwipeRow({ className, onDelete, children }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const base = useRef(0);
  const moved = useRef(false);
  const xNow = useRef(0);
  const setPos = (v) => {
    xNow.current = v;
    setX(v);
  };

  const down = (e) => {
    start.current = { x: e.clientX, y: e.clientY };
    base.current = xNow.current;
    moved.current = false;
  };
  const move = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!moved.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        start.current = null; // scrolling up/down, not a swipe
        return;
      }
      moved.current = true;
      setDragging(true);
    }
    setPos(Math.min(0, Math.max(-360, base.current + dx)));
  };
  const up = async () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (!moved.current) return;
    if (xNow.current < -200) {
      setPos(0);
      await onDelete(); // swiped all the way: delete
    } else {
      setPos(xNow.current < -DELETE_W / 2 ? -DELETE_W : 0);
    }
  };
  // After a swipe, or while open, a tap just closes the row instead of opening/ticking it.
  const clickCapture = (e) => {
    if (moved.current || xNow.current !== 0) {
      e.stopPropagation();
      e.preventDefault();
      moved.current = false;
      if (xNow.current !== 0) setPos(0);
    }
  };

  return (
    <div className="td-swipe">
      <button
        className="td-swipe-del"
        style={{ visibility: x < 0 || dragging ? 'visible' : 'hidden' }}
        onClick={async () => {
          setPos(0);
          await onDelete();
        }}
        aria-label="Delete"
      >
        Delete
      </button>
      <div
        className={className}
        style={{ transform: `translateX(${x}px)`, transition: dragging ? 'none' : 'transform 0.2s ease' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={clickCapture}
      >
        {children}
      </div>
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
          <div className="td-sheet-title">{isTask ? 'Task' : item.label}</div>
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
