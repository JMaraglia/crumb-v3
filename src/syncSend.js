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
import { pendingChanges, removeSent, parkStuck, setRecording, clearOutbox, flushRecording, quietly } from './outbox';
import { planPull } from './syncPull';

export const TEST_DEVICE_KEY = 'crumb_sync_test_device'; // '1' = this copy holds demo data only
const UPLOADED_KEY = 'crumb_sync_uploaded';               // when the first upload finished
const LAST_SENT_KEY = 'crumb_sync_last_sent';             // when changes were last sent
const PULLED_KEY = 'crumb_sync_pulled_at';                // S4: cloud time of the last check (asks for changes since then)
const LAST_CHECK_KEY = 'crumb_sync_last_checked';         // S4: when this device last checked the cloud
const BATCH = 50;

export const isTestDevice = () => readText(TEST_DEVICE_KEY) === '1';
export const uploadedAt = () => readText(UPLOADED_KEY) || '';
export const lastSentAt = () => readText(LAST_SENT_KEY) || '';
export const lastCheckedAt = () => readText(LAST_CHECK_KEY) || '';
let pullNote = ''; // why the last check didn't apply (safety brake), shown in Cloud Test
export const lastPullNote = () => pullNote;
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

// ---------------------------------------------------------------- S4: bringing changes down
// Typing somewhere? Then wait: a screen refresh would interrupt you. The next check (30 seconds) tries again.
function typing() {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!el) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
}

async function pullOnce(sb, { force = false } = {}) {
  const ws = await myWorkspace(sb);
  const since = readText(PULLED_KEY) || null;
  const { data, error } = await sb.rpc('pull_changes', { p_workspace: ws, p_since: since });
  if (error) throw error;
  if (!force && typing()) return { skipped: true, typing: true };
  const waiting = new Set((await pendingChanges()).map((c) => c.key));
  const plan = planPull(data, readText, waiting);
  writeText(LAST_CHECK_KEY, new Date().toISOString());
  if (plan.blocked) {
    pullNote = plan.blocked; // nothing applied; the same changes are asked for again next time
    return { changed: 0, blocked: plan.blocked };
  }
  let ok = true;
  quietly(() => {
    Object.entries(plan.writes).forEach(([k, text]) => {
      if (!writeText(k, text)) ok = false;
    });
  });
  if (!ok) {
    pullNote = 'This device ran out of room, so some changes from the cloud couldn’t be saved.';
    return { changed: 0, blocked: pullNote };
  }
  pullNote = '';
  // Ask from a little before the cloud's clock next time, so nothing saved at the same moment is missed
  // (bringing a record down twice changes nothing).
  const t = Date.parse(data && data.server_time);
  if (!Number.isNaN(t)) writeText(PULLED_KEY, new Date(t - 120000).toISOString());
  const keys = Object.keys(plan.writes);
  if (keys.length) window.dispatchEvent(new CustomEvent('crumb-pulled', { detail: { keys } }));
  return { changed: keys.length, skipped: plan.skipped };
}

let pulling = null;
export function pullNow({ quiet = false } = {}) {
  if (pulling) return pulling;
  pulling = (async () => {
    const sb = cloud();
    if (!sb || !isTestDevice() || !uploadedAt()) return { skipped: true };
    const { data: s } = await sb.auth.getSession();
    if (!s || !s.session) return { skipped: true };
    if (typing()) return { skipped: true, typing: true };
    await sendNow({ quiet: true }); // this device's own changes go up first
    return pullOnce(sb);
  })()
    .catch((err) => {
      if (!quiet) throw err;
      return { changed: 0, error: String(err && err.message) };
    })
    .finally(() => {
      pulling = null;
      status();
    });
  return pulling;
}

// A second EMPTY copy joins the test: it gets everything from the test cloud and becomes a test copy.
// Refuses on a copy with real customers or prospects.
export async function joinFromCloud() {
  if (hasRealAccounts()) throw new Error('This copy of Crumb already has customers or prospects, so nothing was downloaded.');
  const sb = cloud();
  if (!sb) throw new Error('Cloud isn’t set up in this version.');
  const { data: s } = await sb.auth.getSession();
  if (!s || !s.session) throw new Error('Sign in first.');
  writeText(PULLED_KEY, '');
  const r = await pullOnce(sb, { force: true }); // everything in the test cloud
  if (r.blocked) throw new Error(r.blocked);
  // only now does this copy become a test copy
  writeText(TEST_DEVICE_KEY, '1');
  writeText(UPLOADED_KEY, new Date().toISOString()); // nothing to upload: everything came from the cloud
  setRecording(true);
  window.location.reload(); // every screen picks up the downloaded data
  return r;
}
