// file: src/syncSend.js
// Sync step S3 (Nov 7 2026): SENDING changes to the cloud — on a TEST COPY ONLY.
//
// Safety rules:
//   * Sending only ever happens on a "test copy": a copy of Crumb that was EMPTY and was filled with the
//     made-up demo data (loadDemoData). A copy with real customers/prospects can never become one, and
//     never sends (your real data moves later, in step S7, with its own approval).
//   * The first upload sends everything in the test copy; after that, only the changes in the outbox.
//   * A batch is saved all-or-nothing by the cloud. If one fails, each change is retried on its own;
//     one the cloud refuses is parked as "stuck" (kept, shown in Cloud Test) so it can't block the rest.
import { readText, writeText, loadCustomers, loadProspects } from './store';
import { cloud } from './cloud';
import { demoData } from './demoData';
import { fullUploadChanges, sendOrder } from './syncDiff';
import { pendingChanges, removeSent, parkStuck, setRecording, clearOutbox, flushRecording } from './outbox';

export const TEST_DEVICE_KEY = 'crumb_sync_test_device'; // '1' = this copy holds demo data only
const UPLOADED_KEY = 'crumb_sync_uploaded';               // when the first upload finished
const LAST_SENT_KEY = 'crumb_sync_last_sent';             // when changes were last sent
const BATCH = 50;

export const isTestDevice = () => readText(TEST_DEVICE_KEY) === '1';
export const uploadedAt = () => readText(UPLOADED_KEY) || '';
export const lastSentAt = () => readText(LAST_SENT_KEY) || '';
export const hasRealAccounts = () => loadCustomers().length > 0 || loadProspects().length > 0;
const status = () => window.dispatchEvent(new Event('crumb-sync-status'));

// Fill an EMPTY copy of Crumb with the made-up demo data and make it a test copy. Refuses otherwise.
export function loadDemoData() {
  if (hasRealAccounts()) throw new Error('This copy of Crumb already has customers or prospects, so demo data was not loaded.');
  const data = demoData();
  Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
  writeText(TEST_DEVICE_KEY, '1');
  setRecording(true);
  window.location.reload(); // so every screen (and the one-time note/date upgrades) picks it up
}

let workspace = null;
async function myWorkspace(sb) {
  if (workspace) return workspace;
  const { data, error } = await sb.from('workspaces').select('id');
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error('Expected exactly one workspace.');
  workspace = data[0].id;
  return workspace;
}

const asOp = (c) => ({
  op_id: c.op_id,
  type: c.type,
  table: c.table,
  id: String(c.id),
  base: c.base === undefined ? null : c.base,
  next: c.next === undefined ? {} : c.next,
  cols: c.cols || {},
  base_version: null,
});

async function sendBatch(sb, ws, entries) {
  const { data, error } = await sb.rpc('apply_changes', {
    p_workspace: ws,
    p_batch: { device: deviceName(), ops: entries.map(asOp) },
  });
  if (error) throw error;
  return data;
}

function deviceName() {
  const ua = navigator.userAgent || '';
  return /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
}

const opId = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// First upload: everything in the test copy.
export async function uploadAll() {
  const sb = cloud();
  if (!sb) throw new Error('Cloud isn’t set up in this version.');
  if (!isTestDevice()) throw new Error('Only a test copy with demo data can upload right now.');
  const { data: s } = await sb.auth.getSession();
  if (!s || !s.session) throw new Error('Sign in first.');
  const ws = await myWorkspace(sb);
  await flushRecording();
  const all = fullUploadChanges(readText).map((c) => ({ ...c, op_id: opId(), key: `${c.table}|${c.id}` }));
  let conflicts = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const r = await sendBatch(sb, ws, all.slice(i, i + BATCH));
    conflicts += Number(r && r.conflicts) || 0;
  }
  await clearOutbox(); // everything that was waiting just went up as part of the full upload
  const now = new Date().toISOString();
  writeText(UPLOADED_KEY, now);
  writeText(LAST_SENT_KEY, now);
  status();
  return { sent: all.length, conflicts };
}

// Send what's waiting in the outbox.
let sending = null;
export function sendNow({ quiet = false } = {}) {
  if (sending) return sending;
  sending = (async () => {
    const sb = cloud();
    if (!sb || !isTestDevice() || !uploadedAt()) return { sent: 0, skipped: true };
    const { data: s } = await sb.auth.getSession();
    if (!s || !s.session) return { sent: 0, skipped: true };
    const ws = await myWorkspace(sb);
    const waiting = (await pendingChanges()).sort(sendOrder);
    if (!waiting.length) return { sent: 0 };
    let sent = 0;
    let conflicts = 0;
    let stuck = 0;
    for (let i = 0; i < waiting.length; i += BATCH) {
      const batch = waiting.slice(i, i + BATCH);
      try {
        const r = await sendBatch(sb, ws, batch);
        conflicts += Number(r && r.conflicts) || 0;
        await removeSent(batch);
        sent += batch.length;
      } catch (err) {
        if (/fetch|network|Failed to fetch|Load failed/i.test(String(err && err.message))) throw err; // no signal: try later
        // The cloud refused the batch: try each change on its own so one bad change can't block the rest.
        for (const one of batch) {
          try {
            const r = await sendBatch(sb, ws, [one]);
            conflicts += Number(r && r.conflicts) || 0;
            await removeSent([one]);
            sent += 1;
          } catch (e) {
            if (/fetch|network|Failed to fetch|Load failed/i.test(String(e && e.message))) throw e;
            await parkStuck(one, e && e.message);
            stuck += 1;
          }
        }
      }
    }
    writeText(LAST_SENT_KEY, new Date().toISOString());
    return { sent, conflicts, stuck };
  })()
    .catch((err) => {
      if (!quiet) throw err;
      return { sent: 0, error: String(err && err.message) };
    })
    .finally(() => {
      sending = null;
      status();
    });
  return sending;
}
