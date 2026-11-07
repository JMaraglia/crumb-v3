// file: src/outbox.js
// Sync step S2 (Nov 7 2026): the OUTBOX — the list of changes waiting to go to the cloud.
// RECORD-ONLY for now: changes are noted here, nothing is sent anywhere (sending is step S3).
//
// * Off unless switched on (Settings → Cloud Test → "Record changes on this device"). When off, Crumb
//   behaves exactly as before: nothing listens to saves.
// * Kept in its own small database on the phone ("crumb-sync"), apart from Crumb's data, so it can never
//   use up the room your customers need.
// * Several changes to the same record are combined into one (earliest "before", latest "after").
// * It can never disturb a save: it only hears about a save after it's finished, and errors are ignored.
import { onSaved, readText, writeText } from './store';
import { changesFor, combine } from './syncDiff';

const FLAG_KEY = 'crumb_sync_record'; // this device only (not backed up)
const DB_NAME = 'crumb-sync';
const STORE = 'outbox';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const out = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

const newOpId = () => {
  try {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
};

// Changes are written one batch after another, in the order saves happened.
let chain = Promise.resolve();
function record(changes) {
  if (!changes.length) return;
  const at = new Date().toISOString();
  chain = chain
    .then(() =>
      tx('readwrite', (st) => {
        changes.forEach((c) => {
          const key = `${c.table}|${c.id}`;
          const req = st.get(key);
          req.onsuccess = () => {
            const merged = combine(req.result || null, { ...c, key, op_id: newOpId(), at });
            if (merged) st.put(merged);
            else st.delete(key);
          };
        });
      })
    )
    .catch(() => {
      /* never disturb the app; the next save tries again */
    })
    .then(() => window.dispatchEvent(new Event('crumb-outbox-changed')));
}

let stop = null;
function listen() {
  if (stop) return;
  stop = onSaved((key, before, after) => {
    const changes = changesFor(key, before, after, readText);
    record(changes);
  });
}

export function isRecording() {
  return readText(FLAG_KEY) === '1';
}

// Called once when Crumb opens.
export function startRecordingIfOn() {
  if (isRecording()) listen();
}

export function setRecording(on) {
  writeText(FLAG_KEY, on ? '1' : '0');
  if (on) listen();
  else if (stop) {
    stop();
    stop = null;
  }
}

export function pendingCount() {
  return chain.then(() => tx('readonly', (st) => st.count())).catch(() => 0);
}

export function pendingChanges() {
  return chain.then(() => tx('readonly', (st) => st.getAll())).then((rows) => rows || []).catch(() => []);
}

export function clearOutbox() {
  chain = chain.then(() => tx('readwrite', (st) => st.clear())).catch(() => {});
  return chain.then(() => window.dispatchEvent(new Event('crumb-outbox-changed')));
}
