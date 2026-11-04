// file: src/BackupPage.jsx
// Backup & Restore. Everything Crumb saves lives on this phone (localStorage), so:
//   Back up now → one .json file with all of it (save to Files / iCloud Drive, or email it).
//   Restore     → pick a backup file, see what's in it, confirm. Before anything is replaced,
//                 the phone's current data is kept as a safety copy ("Undo last restore").
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline, IoDownloadOutline, IoArrowUndoOutline } from 'react-icons/io5';
import './BackupPage.css';

const LAST_BACKUP_KEY = 'crumb_last_backup'; // when the last backup file was made
const SAFETY_KEY = 'crumb_safety_copy';      // phone's data from just before the last restore
const NOT_BACKED_UP = [LAST_BACKUP_KEY, SAFETY_KEY];

// Everything Crumb stores: every "crumb_…" key plus the older itinerary key.
function isCrumbKey(k) {
  return (k.startsWith('crumb_') || k === 'visitData') && !NOT_BACKED_UP.includes(k);
}

export function readLastBackup() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY) || '';
  } catch {
    return '';
  }
}

function snapshot() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isCrumbKey(k)) data[k] = localStorage.getItem(k);
  }
  return { app: 'crumb', version: 1, createdAt: new Date().toISOString(), data };
}

const parse = (raw, fallback) => {
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
};

// "12 customers · 30 prospects · 85 notes · 14 calendar events"
function summarize(backup) {
  const d = backup.data || {};
  const list = (k) => {
    const v = parse(d[k], []);
    return Array.isArray(v) ? v.filter((a) => a && a.name && String(a.name).trim()) : [];
  };
  const customers = list('crumb_contacts');
  const prospects = list('crumb_prospects');
  const notes = [...customers, ...prospects].reduce((n, a) => n + (Array.isArray(a.notes) ? a.notes.length : 0), 0);
  const events = parse(d.crumb_calendar_events, []);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return [
    plural(customers.length, 'customer'),
    plural(prospects.length, 'prospect'),
    plural(notes, 'note'),
    plural(Array.isArray(events) ? events.length : 0, 'calendar event'),
  ].join(' · ');
}

function niceWhen(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const d = new Date(t);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function daysAgo(iso) {
  const t = Date.parse(iso);
  if (!t) return null;
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(new Date()) - start(new Date(t))) / 86400000);
}

// Replace the phone's Crumb data with a backup's, then reload so every screen re-reads it.
function writeBackup(backup) {
  Object.keys(localStorage)
    .filter(isCrumbKey)
    .forEach((k) => localStorage.removeItem(k));
  Object.entries(backup.data || {}).forEach(([k, v]) => {
    if (isCrumbKey(k) && typeof v === 'string') localStorage.setItem(k, v);
  });
}

export default function BackupPage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(null); // backup picked for restore, waiting for confirm
  const [error, setError] = useState('');
  const safety = parse(localStorage.getItem(SAFETY_KEY), null);
  const current = snapshot();

  const markBackedUp = () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now);
    } catch {
      /* not critical */
    }
    setLastBackup(now);
  };

  const backUp = async () => {
    setMessage('');
    const backup = snapshot();
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // local date
    const fileName = `Crumb backup ${day}.json`;
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    try {
      const file = new File([blob], fileName, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        markBackedUp();
        setMessage('Backup made. Keep it somewhere safe, like iCloud Drive or your email.');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // closed the share sheet: nothing saved
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markBackedUp();
    setMessage('Backup downloaded.');
  };

  const pickFile = (e) => {
    setError('');
    setMessage('');
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // so picking the same file again still works
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const backup = parse(reader.result, null);
      if (!backup || backup.app !== 'crumb' || !backup.data || typeof backup.data !== 'object') {
        setError("That file isn't a Crumb backup. Pick a file named like \"Crumb backup 2026-11-03.json\".");
        return;
      }
      setPending(backup);
    };
    reader.onerror = () => setError("Couldn't read that file. Try picking it again.");
    reader.readAsText(file);
  };

  const confirmRestore = () => {
    // Keep what's on the phone now, so the restore can be undone.
    try {
      localStorage.setItem(SAFETY_KEY, JSON.stringify(snapshot()));
    } catch {
      setPending(null);
      setError(
        "There isn't room on this phone to keep a safety copy, so nothing was changed. Tap Back up now first, then try again."
      );
      return;
    }
    writeBackup(pending);
    window.location.replace('/'); // reload so every screen uses the restored data
  };

  const undoRestore = () => {
    if (!safety) return;
    if (!window.confirm(`Put back the data that was on this phone before the last restore (${niceWhen(safety.createdAt)})?`)) return;
    const now = snapshot();
    writeBackup(safety);
    try {
      localStorage.setItem(SAFETY_KEY, JSON.stringify(now)); // so this can be undone too
    } catch {
      localStorage.removeItem(SAFETY_KEY);
    }
    window.location.replace('/');
  };

  const ago = daysAgo(lastBackup);
  const lastText = !lastBackup
    ? 'Never backed up'
    : ago === 0
    ? `Last backup: today, ${new Date(lastBackup).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : ago === 1
    ? 'Last backup: yesterday'
    : `Last backup: ${ago} days ago`;
  const stale = !lastBackup || ago >= 7;

  return (
    <div className="bk-page">
      <header className="bk-header">
        <button className="bk-icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <FaArrowLeft />
        </button>
        <span />
        <span />
      </header>

      <div className="bk-content">
        <h1 className="bk-title">Backup & Restore</h1>
        <p className="bk-intro">
          Everything in Crumb is saved on this phone. Make a backup file regularly and keep it somewhere safe, so a lost or
          reset phone doesn't mean lost data.
        </p>

        {/* Back up */}
        <div className="bk-card">
          <div className={`bk-status ${stale ? 'is-stale' : ''}`}>{lastText}</div>
          <div className="bk-what">On this phone now: {summarize(current)}</div>
          <button className="bk-btn" onClick={backUp}>
            <IoShareOutline className="bk-btn-icon" />
            Back up now
          </button>
          <div className="bk-hint">
            In the share sheet, choose <strong>Save to Files</strong> (pick iCloud Drive) or email it to yourself.
          </div>
        </div>
        {message && <div className="bk-message">{message}</div>}

        {/* Restore */}
        <div className="bk-section">Restore</div>
        <div className="bk-card">
          <div className="bk-what">
            Load a backup file. It replaces what's on this phone, so you'll see what's in the file and confirm first.
          </div>
          <button className="bk-btn bk-btn-plain" onClick={() => fileRef.current && fileRef.current.click()}>
            <IoDownloadOutline className="bk-btn-icon" />
            Choose backup file
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="bk-file" onChange={pickFile} />
        </div>
        {error && <div className="bk-error">{error}</div>}

        {safety && (
          <>
            <div className="bk-section">Undo</div>
            <div className="bk-card">
              <div className="bk-what">
                Safety copy from before your last restore ({niceWhen(safety.createdAt)}): {summarize(safety)}
              </div>
              <button className="bk-btn bk-btn-plain" onClick={undoRestore}>
                <IoArrowUndoOutline className="bk-btn-icon" />
                Undo last restore
              </button>
            </div>
          </>
        )}
      </div>

      {/* Confirm restore */}
      {pending && (
        <div className="bk-sheet-backdrop" onClick={() => setPending(null)}>
          <div className="bk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bk-sheet-title">Restore this backup?</div>
            <div className="bk-sheet-row">
              <span className="bk-sheet-label">Backup from</span>
              <span>{niceWhen(pending.createdAt) || 'Unknown date'}</span>
            </div>
            <div className="bk-sheet-row">
              <span className="bk-sheet-label">Has</span>
              <span>{summarize(pending)}</span>
            </div>
            <div className="bk-sheet-row">
              <span className="bk-sheet-label">Replaces</span>
              <span>{summarize(current)} on this phone</span>
            </div>
            <div className="bk-sheet-note">
              What's on the phone now is kept as a safety copy, so you can undo this.
            </div>
            <div className="bk-sheet-actions">
              <button className="bk-sheet-cancel" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button className="bk-sheet-go" onClick={confirmRestore}>
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
