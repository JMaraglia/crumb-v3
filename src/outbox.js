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

const STUCK = 'stuck'; // changes the cloud refused (kept, shown in Cloud Test, never lost)
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
      if (!req.result.objectStoreNames.contains(STUCK)) req.result.createObjectStore(STUCK, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(mode, fn, store = STORE) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const out = fn(t.objectStore(store));
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

// Sending (S3, test copy only) lives in syncSend.js and is loaded only on a test copy, so the cloud
// library never loads for normal use.
let sendTimer = null;
function scheduleSend() {
  if (readText('crumb_sync_test_device') !== '1') return;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    import('./syncSend').then((m) => m.sendNow({ quiet: true })).catch(() => {});
  }, 3000);
}
if (typeof window !== 'undefined') window.addEventListener('crumb-outbox-changed', () => scheduleSend());

// Sync step S4 (test copy only): check the cloud for changes from your other devices every 30 seconds
// while Crumb is open, and right away when you come back to it.
let pullTimer = null;
function pullSoon() {
  if (readText('crumb_sync_test_device') !== '1') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  import('./syncSend').then((m) => m.pullNow({ quiet: true })).catch(() => {});
}
function startPulling() {
  if (pullTimer || typeof window === 'undefined' || readText('crumb_sync_test_device') !== '1') return;
  pullTimer = setInterval(pullSoon, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pullSoon();
  });
  setTimeout(pullSoon, 1500);
}

// Changes that came FROM the cloud are saved quietly: not recorded as new changes (so they don't bounce back).
let paused = 0;
export function quietly(fn) {
  paused += 1;
  try {
    return fn();
  } finally {
    paused -= 1;
  }
}

let stop = null;
function listen() {
  if (stop) return;
  stop = onSaved((key, before, after) => {
    if (paused) return;
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
  scheduleSend(); // a test copy sends anything still waiting from last time
  startPulling(); // …and checks the cloud for changes from your other devices
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

// ---- used by syncSend.js ----
export const flushRecording = () => chain;
// Remove changes that were sent — but only if they weren't changed again while sending (then they stay).
export function removeSent(sent) {
  chain = chain
    .then(() =>
      tx('readwrite', (st) => {
        sent.forEach((c) => {
          const req = st.get(c.key);
          req.onsuccess = () => {
            if (req.result && req.result.op_id === c.op_id) st.delete(c.key);
          };
        });
      })
    )
    .catch(() => {});
  return chain;
}
// Park a change the cloud refused: out of the way of the others, never lost.
export function parkStuck(entry, reason) {
  chain = chain
    .then(() => tx('readwrite', (st) => st.put({ ...entry, reason: String(reason || '').slice(0, 200) }), STUCK))
    .then(() => tx('readwrite', (st) => st.delete(entry.key)))
    .catch(() => {});
  return chain;
}
export function stuckChanges() {
  return chain.then(() => tx('readonly', (st) => st.getAll(), STUCK)).then((r) => r || []).catch(() => []);
}
