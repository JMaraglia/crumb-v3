// file: src/BackupPage.jsx
// Backup & Restore. Everything Crumb saves lives on this phone (localStorage + photos in IndexedDB), so:
//   Back up now        → one .json file with all of it plus a count list (manifest); the file is
//                        read back and checked before it's handed over. Unreadable photos are never
//                        dropped silently.
//   Check Backup File  → reads a file fully, opens every photo, compares with its count list. Changes nothing.
//   Restore            → file is fully checked first; the phone's data is kept as a safety copy
//                        ("Undo last restore"); photos + data are saved all-or-nothing; then what the
//                        phone actually saved is checked against the file and the result is shown.
//   This device's notification ID is never put in a backup or replaced by a restore.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline, IoDownloadOutline, IoArrowUndoOutline, IoShieldCheckmarkOutline } from 'react-icons/io5';
import {
  photosForBackup,
  decodeBackupPhoto,
  putPhotosAll,
  rollbackPhotos,
  photoIds,
  allPhotos,
  saveSafetyCopy,
  loadSafetyCopy,
} from './photos';
import { isBackedUpKey, makeManifest, compareToManifest, countData, COUNT_LABELS } from './backupCheck';
import { loadAccounts } from './store';
import './BackupPage.css';

const LAST_BACKUP_KEY = 'crumb_last_backup';       // when the last backup file was made
const OLD_SAFETY_KEY = 'crumb_safety_copy';        // older safety copy (kept in localStorage before Nov 6)
const RESULT_KEY = 'crumb_restore_result';         // result of the last restore / undo, shown once after reload

export function readLastBackup() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY) || '';
  } catch {
    return '';
  }
}

// Everything Crumb saves on this phone (except this device's own bookkeeping — see backupCheck.js).
function readAll() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isBackedUpKey(k)) data[k] = localStorage.getItem(k);
  }
  return data;
}

const parse = (raw, fallback) => {
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "12 customers · 30 prospects · 85 notes · 14 calendar events · 6 photos"
function summarize(c) {
  if (!c) return '';
  return [
    plural(c.customers, 'customer'),
    plural(c.prospects, 'prospect'),
    plural(c.notes, 'note'),
    plural(c.events, 'calendar event'),
    c.photos ? plural(c.photos, 'photo') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// Which account a photo belongs to, by name ("customer-12" → "Joe's Pizza").
function accountName(key) {
  const m = /^(customer|prospect)-(.+)$/.exec(String(key || ''));
  if (!m) return 'an account';
  const list = loadAccounts(m[1]);
  const a = list.find((x) => x && String(x.id) === m[2]);
  return (a && a.name) || `a ${m[1]} no longer in Crumb`;
}
const namesOf = (list) => [...new Set(list.map((p) => accountName(p.key)))].join(', ');

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

// Replace the phone's saved data with `next`. All or nothing: if any write fails (e.g. storage
// full), the phone's previous data (`prev`) is written back and the error is passed on.
function replaceSaved(next, prev) {
  const clear = () => Object.keys(localStorage).filter(isBackedUpKey).forEach((k) => localStorage.removeItem(k));
  const write = (data) =>
    Object.entries(data || {}).forEach(([k, v]) => {
      if (isBackedUpKey(k) && typeof v === 'string') localStorage.setItem(k, v);
    });
  try {
    clear();
    write(next);
  } catch (err) {
    try {
      clear();
      write(prev);
    } catch {
      /* the previous data fit before, so this is not expected to fail */
    }
    throw err;
  }
}

// Read a backup file completely and check it: every saved item against the file's own list,
// and every photo actually opens. Nothing on the phone is touched.
async function inspect(backup) {
  const problems = [];
  const data = backup.data || {};
  Object.entries(data).forEach(([k, v]) => {
    if (typeof v !== 'string') problems.push(`Saved item is damaged: ${k}`);
  });
  const list = Array.isArray(backup.photos) ? backup.photos : [];
  const records = [];
  const bad = [];
  for (const p of list) {
    try {
      records.push(await decodeBackupPhoto(p));
    } catch {
      bad.push(p || {});
    }
  }
  if (bad.length) problems.push(`${plural(bad.length, 'photo')} in the file won't open (${namesOf(bad)})`);
  const manifest = backup.manifest || null;
  if (manifest) problems.push(...compareToManifest(manifest, data, list.map((p) => p && p.id).filter(Boolean)));
  return {
    problems,
    records,
    manifest: manifest || makeManifest(data, records.map((r) => r.id)),
    counts: countData(data, list.length),
    old: !manifest,
    skipped: Number(backup.skippedPhotos) || 0,
  };
}

export default function BackupPage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const fileMode = useRef('restore'); // what the picked file is for: 'restore' or 'check'
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');          // "Checking backup…" while working
  const [pending, setPending] = useState(null);  // { backup, info } picked for restore, waiting for confirm
  const [checked, setChecked] = useState(null);  // { backup, info } from Check Backup File
  const [skipAsk, setSkipAsk] = useState(null);  // photos that couldn't be read during Back up now
  const [safety, setSafety] = useState(null);    // safety copy from before the last restore
  const [phonePhotos, setPhonePhotos] = useState(null);
  const [result, setResult] = useState(() => parse(localStorage.getItem(RESULT_KEY), null));
  const current = countData(readAll(), phonePhotos || 0);

  useEffect(() => {
    photoIds()
      .then((ids) => setPhonePhotos(ids.length))
      .catch(() => setPhonePhotos(0));
    loadSafetyCopy()
      .catch(() => null)
      .then((copy) => setSafety(copy || parse(localStorage.getItem(OLD_SAFETY_KEY), null)));
  }, []);

  const markBackedUp = () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now);
    } catch {
      /* not critical */
    }
    setLastBackup(now);
  };

  // Back up now. allowSkip = the person already agreed to leave out photos that can't be read.
  const backUp = async (allowSkip = false) => {
    setMessage('');
    setError('');
    setSkipAsk(null);
    setBusy('Making backup…');
    let backup;
    let json;
    try {
      const data = readAll();
      let photos = [];
      let failed = [];
      try {
        ({ photos, failed } = await photosForBackup());
      } catch {
        failed = [{ key: '', all: true }];
      }
      if (failed.length && !allowSkip) {
        setBusy('');
        setSkipAsk(failed);
        return;
      }
      backup = {
        app: 'crumb',
        version: 2,
        createdAt: new Date().toISOString(),
        data,
        photos,
        skippedPhotos: failed.some((f) => f.all) ? 'all' : failed.length,
        manifest: makeManifest(data, photos.map((p) => p.id)),
      };
      json = JSON.stringify(backup);
      // Check the finished file before handing it over: read it back and compare with its own list.
      const back = JSON.parse(json);
      const problems = compareToManifest(back.manifest, back.data, (back.photos || []).map((p) => p.id));
      if (problems.length) throw new Error(problems.join('; '));
    } catch {
      setBusy('');
      setError("Crumb couldn't make a complete backup file, so none was made. Close Crumb, open it again, and try once more.");
      return;
    }
    setBusy('');
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // local date
    const fileName = `Crumb backup ${day}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const madeText = `Backup made and checked: ${summarize(backup.manifest.counts)}.`;
    const skippedText = backup.skippedPhotos
      ? ` ${backup.skippedPhotos === 'all' ? 'Photos were' : `${plural(backup.skippedPhotos, 'photo')} ${backup.skippedPhotos === 1 ? 'was' : 'were'}`} left out.`
      : '';
    try {
      const file = new File([blob], fileName, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        markBackedUp();
        setMessage(`${madeText}${skippedText} Keep it somewhere safe, like iCloud Drive or your email.`);
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
    setMessage(`${madeText}${skippedText} Downloaded.`);
  };

  const choose = (mode) => {
    fileMode.current = mode;
    if (fileRef.current) fileRef.current.click();
  };

  const pickFile = (e) => {
    setError('');
    setMessage('');
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // so picking the same file again still works
    if (!file) return;
    const mode = fileMode.current;
    setBusy('Checking backup…');
    const reader = new FileReader();
    reader.onload = async () => {
      const backup = parse(reader.result, null);
      if (!backup || backup.app !== 'crumb' || !backup.data || typeof backup.data !== 'object') {
        setBusy('');
        setError("That file isn't a Crumb backup. Pick a file named like \"Crumb backup 2026-11-03.json\".");
        return;
      }
      let info;
      try {
        info = await inspect(backup);
      } catch {
        info = { problems: ["Crumb couldn't finish reading this file."], records: [], counts: countData(backup.data, 0) };
      }
      setBusy('');
      if (mode === 'check') {
        setChecked({ backup, info });
        return;
      }
      if (info.problems.length) {
        setError(`This backup file has problems, so nothing was restored: ${info.problems.join('; ')}.`);
        return;
      }
      setPending({ backup, info });
    };
    reader.onerror = () => {
      setBusy('');
      setError("Couldn't read that file. Try picking it again.");
    };
    reader.readAsText(file);
  };

  const saveResult = (r) => {
    try {
      // A device syncing your data is PAUSED after a restore or undo, so the restored data never
      // silently mixes with the cloud. Resume it (Settings → Cloud) once you've decided what's right.
      if (localStorage.getItem('crumb_sync_mode') === 'real') localStorage.setItem('crumb_sync_paused', '1');
      localStorage.setItem(RESULT_KEY, JSON.stringify(r));
    } catch {
      /* shown anyway below if the reload doesn't happen */
    }
  };

  // Restore: all or nothing, then check what the phone actually saved.
  const confirmRestore = async () => {
    const { backup, info } = pending;
    setPending(null);
    setBusy('Restoring…');
    const before = readAll();
    let beforeIds;
    try {
      beforeIds = await photoIds();
      // 1. Keep what's on the phone now, so the restore can be undone.
      await saveSafetyCopy({ app: 'crumb', createdAt: new Date().toISOString(), data: before, manifest: makeManifest(before, beforeIds) });
    } catch {
      setBusy('');
      setError("Crumb couldn't keep a safety copy of this phone's data, so nothing was changed. Tap Back up now first, then try again.");
      return;
    }
    try {
      localStorage.removeItem(OLD_SAFETY_KEY); // the older copy is replaced by the new one (frees room)
    } catch {
      /* not critical */
    }
    // 2. Photos, in one step (all saved or none). Remember what was there, in case step 3 fails.
    const have = new Set(beforeIds);
    const added = info.records.filter((r) => !have.has(String(r.id))).map((r) => r.id);
    let replaced = [];
    try {
      const replacing = new Set(info.records.filter((r) => have.has(String(r.id))).map((r) => String(r.id)));
      if (replacing.size) replaced = (await allPhotos()).filter((p) => replacing.has(String(p.id)));
      await putPhotosAll(info.records);
    } catch {
      setBusy('');
      setError("Crumb couldn't save the backup's photos, so nothing was changed.");
      return;
    }
    // 3. Everything else. If any part can't be saved, the phone is put back as it was.
    try {
      replaceSaved(backup.data, before);
    } catch {
      await rollbackPhotos(added, replaced).catch(() => {});
      setBusy('');
      setError("There isn't room on this phone for this backup, so nothing was changed.");
      return;
    }
    // 4. Check what the phone now has against the backup's own list.
    const now = readAll();
    const ids = await photoIds().catch(() => []);
    const problems = compareToManifest(info.manifest, now, ids);
    const haveIds = new Set(ids);
    saveResult({
      kind: 'restore',
      at: new Date().toISOString(),
      from: backup.createdAt || '',
      ok: problems.length === 0,
      problems,
      counts: countData(now, (info.manifest.photoIds || []).filter((id) => haveIds.has(String(id))).length),
      old: info.old,
    });
    window.location.replace('/backup'); // reload so every screen uses the restored data
  };

  const undoRestore = async () => {
    if (!safety) return;
    if (!window.confirm(`Put back the data that was on this phone before the last restore (${niceWhen(safety.createdAt)})?`)) return;
    setBusy('Undoing…');
    const now = readAll();
    const nowIds = await photoIds().catch(() => []);
    try {
      replaceSaved(safety.data, now);
    } catch {
      setBusy('');
      setError("There isn't room on this phone to put the safety copy back, so nothing was changed.");
      return;
    }
    await saveSafetyCopy({ app: 'crumb', createdAt: new Date().toISOString(), data: now, manifest: makeManifest(now, nowIds) }).catch(() => {});
    try {
      localStorage.removeItem(OLD_SAFETY_KEY);
    } catch {
      /* not critical */
    }
    const after = readAll();
    const ids = await photoIds().catch(() => []);
    const manifest = safety.manifest || makeManifest(safety.data, []);
    const problems = compareToManifest(manifest, after, ids);
    saveResult({ kind: 'undo', at: new Date().toISOString(), from: safety.createdAt, ok: problems.length === 0, problems, counts: countData(after, ids.length) });
    window.location.replace('/backup');
  };

  const dismissResult = () => {
    try {
      localStorage.removeItem(RESULT_KEY);
    } catch {
      /* not critical */
    }
    setResult(null);
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
  const safetyCounts = safety ? countData(safety.data, safety.manifest ? (safety.manifest.photoIds || []).length : 0) : null;

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

        {/* Result of the last restore / undo (shown once, after the reload) */}
        {result && (
          <div className={`bk-card bk-result ${result.ok ? 'is-ok' : 'is-bad'}`}>
            <div className="bk-result-title">
              {result.ok
                ? result.kind === 'undo'
                  ? 'Undo Verified ✓'
                  : 'Restore Verified ✓'
                : result.kind === 'undo'
                ? 'Undo Finished With Problems'
                : 'Restore Finished With Problems'}
            </div>
            <div className="bk-what">
              {result.ok
                ? `Everything in the ${result.kind === 'undo' ? 'safety copy' : 'backup'}${result.from ? ` from ${niceWhen(result.from)}` : ''} is on this phone and matches.`
                : `Some things didn't match the ${result.kind === 'undo' ? 'safety copy' : 'backup'}. You can undo below.`}
              {result.old && result.ok ? ' (Older backup file: checked against its own contents.)' : ''}
            </div>
            <CountTable rows={[['On this phone now', result.counts]]} />
            {!result.ok && (
              <ul className="bk-problems">
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <button className="bk-btn bk-btn-plain" onClick={dismissResult}>
              OK
            </button>
          </div>
        )}

        {/* Back up */}
        <div className="bk-card">
          <div className={`bk-status ${stale ? 'is-stale' : ''}`}>{lastText}</div>
          <div className="bk-what">On this phone now: {summarize(current)}</div>
          <button className="bk-btn" onClick={() => backUp(false)}>
            <IoShareOutline className="bk-btn-icon" />
            Back up now
          </button>
          <div className="bk-hint">
            In the share sheet, choose <strong>Save to Files</strong> (pick iCloud Drive) or email it to yourself.
          </div>
        </div>
        {message && <div className="bk-message">{message}</div>}

        {/* Check */}
        <div className="bk-section">Check</div>
        <div className="bk-card">
          <div className="bk-what">
            Make sure a backup file is complete: every item is counted and every photo is opened. Nothing on this phone
            changes.
          </div>
          <button className="bk-btn bk-btn-plain" onClick={() => choose('check')}>
            <IoShieldCheckmarkOutline className="bk-btn-icon" />
            Check Backup File
          </button>
        </div>

        {/* Restore */}
        <div className="bk-section">Restore</div>
        <div className="bk-card">
          <div className="bk-what">
            Load a backup file. It replaces what's on this phone, so you'll see what's in the file and confirm first.
          </div>
          <button className="bk-btn bk-btn-plain" onClick={() => choose('restore')}>
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
                Safety copy from before your last restore ({niceWhen(safety.createdAt)}): {summarize(safetyCounts)}
              </div>
              <button className="bk-btn bk-btn-plain" onClick={undoRestore}>
                <IoArrowUndoOutline className="bk-btn-icon" />
                Undo last restore
              </button>
            </div>
          </>
        )}
      </div>

      {busy && (
        <div className="bk-busy">
          <div className="bk-busy-box">{busy}</div>
        </div>
      )}

      {/* Photos that couldn't be read while backing up */}
      {skipAsk && (
        <div className="bk-sheet-backdrop" onClick={() => setSkipAsk(null)}>
          <div className="bk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bk-sheet-title">Some Photos Can't Be Backed Up</div>
            <div className="bk-sheet-note">
              {skipAsk.some((f) => f.all)
                ? "Crumb couldn't open this phone's photo storage."
                : `${plural(skipAsk.length, 'photo')} couldn't be read (${namesOf(skipAsk)}).`}{' '}
              You can make the backup without {skipAsk.some((f) => f.all) ? 'photos' : 'them'}; everything else is included.
            </div>
            <div className="bk-sheet-actions">
              <button className="bk-sheet-cancel" onClick={() => setSkipAsk(null)}>
                Cancel
              </button>
              <button className="bk-sheet-go is-blue" onClick={() => backUp(true)}>
                Back Up Without {skipAsk.some((f) => f.all) ? 'Photos' : 'Them'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check Backup File result */}
      {checked && (
        <div className="bk-sheet-backdrop" onClick={() => setChecked(null)}>
          <div className="bk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className={`bk-sheet-title ${checked.info.problems.length ? 'is-bad' : 'is-ok'}`}>
              {checked.info.problems.length ? 'This Backup Has Problems' : 'Backup File Is Complete ✓'}
            </div>
            <div className="bk-sheet-note">
              Made {niceWhen(checked.backup.createdAt) || 'on an unknown date'}.{' '}
              {checked.info.problems.length
                ? "Don't rely on this file. Make a new backup."
                : checked.info.old
                ? 'Older backup file (no count list inside): everything in it was read and every photo opened.'
                : 'Every item matches the list inside the file, and every photo opens.'}
              {checked.info.skipped ? ` Photos were left out of this backup when it was made.` : ''}
            </div>
            {checked.info.problems.length > 0 && (
              <ul className="bk-problems">
                {checked.info.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <CountTable
              rows={[
                ['In the file', checked.info.counts],
                ['On this phone', current],
              ]}
            />
            <div className="bk-sheet-note">Differences are normal if you've added or changed things since the backup.</div>
            <div className="bk-sheet-actions">
              <button className="bk-sheet-cancel" onClick={() => setChecked(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm restore */}
      {pending && (
        <div className="bk-sheet-backdrop" onClick={() => setPending(null)}>
          <div className="bk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bk-sheet-title">Restore this backup?</div>
            <div className="bk-sheet-row">
              <span className="bk-sheet-label">Backup from</span>
              <span>{niceWhen(pending.backup.createdAt) || 'Unknown date'}</span>
            </div>
            <div className="bk-sheet-row">
              <span className="bk-sheet-label">Has</span>
              <span>{summarize(pending.info.counts)}</span>
            </div>
            <div className="bk-sheet-row">
              <span className="bk-sheet-label">Replaces</span>
              <span>{summarize(current)} on this phone</span>
            </div>
            <div className="bk-sheet-note">
              The file was checked and is complete. What's on the phone now is kept as a safety copy, so you can undo this.
              Photos already on this phone are kept.
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

// Counts side by side: one column per row of [label, counts].
function CountTable({ rows }) {
  return (
    <table className="bk-counts">
      <thead>
        <tr>
          <th />
          {rows.map(([label]) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {COUNT_LABELS.map(([k, label]) => (
          <tr key={k}>
            <td>{label}</td>
            {rows.map(([col, c]) => (
              <td key={col} className={rows.length > 1 && rows.some(([, o]) => o[k] !== c[k]) ? 'is-diff' : ''}>
                {c ? c[k] : ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
