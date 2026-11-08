// file: src/syncMove.js
// Sync step S7 (Nov 7 2026): moving your REAL data to the cloud (iPhone), and downloading it (iPad).
//
// Move My Data (a device with your customers):
//   1. checkMove()  DRY RUN: counts what would go up, finds problems, sends nothing.
//   2. moveMyData() uploads it in batches (a retry updates, never duplicates), then photos, then VERIFIES:
//      every record in the cloud is compared with this device, one by one, by its ID tag. Only a clean
//      match turns this device on (Synced). This device's data is never changed by any of it.
// Download My Data (an EMPTY device): downloadMyData() brings everything down and verifies the same way.
import { readText, writeText, loadCustomers, loadProspects, snapshotSaved, restoreSaved } from './store';
import { cloud } from './cloud';
import { fullUploadChanges, sendOrder, SETTING_KEYS } from './syncDiff';
import { planPull } from './syncPull';
import { allPhotos, saveSafetyCopy, clearAllPhotos, putPhotosAll } from './photos';
import { isBackedUpKey, makeManifest } from './backupCheck';
import { syncPhotos, splitKey, PHOTOS_SENT_KEY, PHOTOS_PULLED_KEY } from './syncPhotos';
import { clearOutbox, setRecording, quietly } from './outbox';
import { isTestProject, isTestCopy, isRealSynced, projectRef, maySync, deviceHasData, MODE_KEY, PROJECT_KEY, PAUSED_KEY, TEST_DEVICE_KEY } from './syncMode';
import { myWorkspace, sendBatch, opId, UPLOADED_KEY, LAST_SENT_KEY, PULLED_KEY, LAST_CHECK_KEY } from './syncSend';

const BACKUP_KEY = 'crumb_last_backup';
export const MOVE_STARTED_KEY = 'crumb_sync_move_started'; // this device started a move to this cloud (a retry may update it)
const BATCH = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const sorted = (v) => {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  return v;
};
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// ---------------------------------------------------------------- pure: what would move, and problems
// Returns { changes, counts, warnings[], blockers[] }. `changes` are ready to send (links to accounts that
// no longer exist are sent without the link; the item itself is unchanged on this device).
export function inspectForMove(read, photos = []) {
  const changes = fullUploadChanges(read);
  const warnings = [];
  const blockers = [];
  const parse = (k) => {
    try {
      const v = JSON.parse(read(k) || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      blockers.push(`Saved ${k === 'crumb_contacts' ? 'customers' : 'prospects'} couldn’t be read.`);
      return [];
    }
  };
  const customers = parse('crumb_contacts');
  const prospects = parse('crumb_prospects');
  const custIds = new Set(customers.map((a) => String(a && a.id)));
  const both = prospects.filter((p) => p && custIds.has(String(p.id)));
  if (both.length) {
    blockers.push(`${both.length} prospect${both.length === 1 ? ' has' : 's have'} the same ID as a customer (${both
      .slice(0, 3)
      .map((p) => p.name || p.id)
      .join(', ')}). Claude needs to fix this before moving.`);
  }
  const accountIds = new Set(changes.filter((c) => c.table === 'accounts').map((c) => String(c.id)));
  let unlinked = 0;
  changes.forEach((c) => {
    if (['events', 'stops', 'todos'].includes(c.table) && c.cols && c.cols.account_id != null && !accountIds.has(String(c.cols.account_id))) {
      c.cols = { ...c.cols, account_id: null };
      unlinked += 1;
    }
  });
  if (unlinked) warnings.push(`${unlinked} calendar event${unlinked === 1 ? '' : 's'}, stops or to-dos point at an account that no longer exists. They’ll go up without that link (nothing changes on this device).`);
  const photoOk = photos.filter((p) => {
    const a = splitKey(p.key);
    return a && accountIds.has(a.id);
  });
  const orphanPhotos = photos.length - photoOk.length;
  if (orphanPhotos) warnings.push(`${orphanPhotos} photo${orphanPhotos === 1 ? '' : 's'} belong to accounts that no longer exist. They stay on this device only.`);
  const n = (t, pred = () => true) => changes.filter((c) => c.table === t && pred(c)).length;
  const counts = {
    customers: n('accounts', (c) => c.cols && c.cols.kind === 'customer'),
    prospects: n('accounts', (c) => c.cols && c.cols.kind === 'prospect'),
    notes: n('notes'),
    events: n('events'),
    stops: n('stops'),
    todos: n('todos'),
    marks: n('day_marks'),
    settings: n('settings'),
    photos: photoOk.length,
  };
  return { changes, counts, warnings, blockers, photoIds: photoOk.map((p) => String(p.id)) };
}

export const COUNT_NAMES = [
  ['customers', 'Customers'],
  ['prospects', 'Prospects'],
  ['notes', 'Notes'],
  ['events', 'Calendar events'],
  ['stops', 'Added itinerary stops'],
  ['todos', 'To-dos'],
  ['marks', 'Itinerary & Call Sheet day marks'],
  ['settings', 'Settings'],
  ['photos', 'Photos'],
];

// ---------------------------------------------------------------- pure: does the cloud match, one by one?
// expected: changes (table, id, next, cols); cloudAnswer: pull_changes(workspace, null); cloudPhotoIds: live photo ids
export function verifyMatch(expected, cloudAnswer, expectedPhotoIds = [], cloudPhotoIds = []) {
  const problems = [];
  const label = { accounts: 'Customers & prospects', notes: 'Notes', events: 'Calendar events', stops: 'Itinerary stops', todos: 'To-dos', day_marks: 'Day marks', settings: 'Settings' };
  const want = {};
  expected.forEach((c) => {
    (want[c.table] = want[c.table] || new Map()).set(String(c.id), c);
  });
  const lines = [];
  Object.keys(label).forEach((t) => {
    const w = want[t] || new Map();
    let rows = (cloudAnswer && cloudAnswer[t]) || [];
    rows = rows.filter((r) => !r.deleted);
    if (t === 'settings') rows = rows.filter((r) => Object.values(SETTING_KEYS).includes(String(r.id)));
    const have = new Map(rows.map((r) => [String(r.id), r]));
    let ok = 0;
    w.forEach((c, id) => {
      const r = have.get(id);
      if (!r) problems.push(`${label[t]}: one is missing in the cloud (${id})`);
      else if (!same(r.data, c.next)) problems.push(`${label[t]}: one doesn’t match (${id})`);
      else if (t === 'accounts' && c.cols && c.cols.kind && r.kind !== c.cols.kind) problems.push(`${label[t]}: ${id} is a ${r.kind} in the cloud`);
      else ok += 1;
    });
    have.forEach((_, id) => {
      if (!w.has(id)) problems.push(`${label[t]}: the cloud has an extra one (${id})`);
    });
    if (w.size || have.size) lines.push(`${label[t]}: ${ok} of ${w.size} match`);
  });
  const cp = new Set(cloudPhotoIds.map(String));
  const missingPhotos = expectedPhotoIds.filter((id) => !cp.has(String(id)));
  if (missingPhotos.length) problems.push(`Photos: ${missingPhotos.length} don’t match`);
  if (expectedPhotoIds.length) lines.push(`Photos: ${expectedPhotoIds.length - missingPhotos.length} of ${expectedPhotoIds.length} match`);
  return { ok: problems.length === 0, lines, problems: problems.slice(0, 12), problemCount: problems.length };
}

// ---------------------------------------------------------------- the real thing
async function ready() {
  const sb = cloud();
  if (!sb) throw new Error('Cloud isn’t set up in this version.');
  if (isTestProject()) throw new Error('This version is connected to the TEST cloud. Your real data only goes to your real cloud.');
  if (isTestCopy()) throw new Error('This is a test copy with demo data, so it can’t be used for your real data.');
  if (isRealSynced()) throw new Error('This device is already syncing.');
  const { data: s } = await sb.auth.getSession();
  if (!s || !s.session) throw new Error('Sign in first.');
  if (!maySync(s.session.user && s.session.user.email)) throw new Error('Cloud sync is coming soon. Your data stays on this device.');
  return { sb, ws: await myWorkspace(sb) };
}

async function cloudNow(sb, ws) {
  const { data, error } = await sb.rpc('pull_changes', { p_workspace: ws, p_since: null });
  if (error) throw error;
  const { data: ph, error: e2 } = await sb.from('photos').select('id, deleted_at').eq('workspace_id', ws);
  if (e2) throw e2;
  return { answer: data, photoIds: (ph || []).filter((p) => !p.deleted_at).map((p) => String(p.id)) };
}
const cloudIsEmpty = (answer) =>
  ['accounts', 'notes', 'events', 'stops', 'todos'].every((t) => !((answer && answer[t]) || []).some((r) => !r.deleted));

export function backupAge() {
  const t = Date.parse(readText(BACKUP_KEY) || '');
  return Number.isNaN(t) ? null : Date.now() - t;
}

// 1. Dry run: nothing is sent.
export async function checkMove({ safetyCopied = false } = {}) {
  const { sb, ws } = await ready();
  if (!(loadCustomers().length || loadProspects().length)) throw new Error('This device has no customers or prospects to move.');
  const photos = await allPhotos();
  const r = inspectForMove(readText, photos);
  const age = backupAge();
  if (!safetyCopied && (age == null || age > DAY_MS)) r.blockers.unshift('Make a backup first (Settings → Backup & Restore → Back Up Now). Moving needs one from the last 24 hours.');
  const { answer } = await cloudNow(sb, ws);
  if (!cloudIsEmpty(answer)) {
    if (readText(MOVE_STARTED_KEY) === projectRef()) r.warnings.push('A move from this device was started before and didn’t finish. Moving again updates what’s there (nothing is doubled).');
    else r.blockers.push('Your cloud already has data in it, so nothing will be moved. Send Claude a screenshot.');
  }
  return r;
}

// 2. Move: upload, photos, verify. Turns this device on only after a clean match.
export async function moveMyData(onStep = () => {}, { safetyCopied = false } = {}) {
  const { sb, ws } = await ready();
  onStep('Checking…');
  const plan = await checkMove({ safetyCopied });
  if (plan.blockers.length) throw new Error(plan.blockers[0]);

  // Start fresh: anything noted during earlier tests is cleared, then changes are noted from here on
  // (an edit made while moving is sent right after).
  await clearOutbox();
  setRecording(true);
  writeText(MOVE_STARTED_KEY, projectRef());
  const all = plan.changes.map((c) => ({ ...c, op_id: opId(), key: `${c.table}|${c.id}` })).sort(sendOrder);
  try {
    for (let i = 0; i < all.length; i += BATCH) {
      onStep(`Uploading… ${Math.min(i + BATCH, all.length)} of ${all.length}`);
      await sendBatch(sb, ws, all.slice(i, i + BATCH));
    }
    onStep('Uploading photos…');
    writeText(PHOTOS_SENT_KEY, '{}');
    await syncPhotos(sb, ws); // uploads every photo (and brings nothing down: the cloud only has these)
    onStep('Checking the cloud matches this device…');
    const { answer, photoIds } = await cloudNow(sb, ws);
    const v = verifyMatch(plan.changes, answer, plan.photoIds, photoIds);
    if (!v.ok) {
      setRecording(false);
      await clearOutbox();
      return { ...v, counts: plan.counts };
    }
    const now = new Date().toISOString();
    writeText(PROJECT_KEY, projectRef());
    writeText(PAUSED_KEY, '0');
    writeText(UPLOADED_KEY, now);
    writeText(LAST_SENT_KEY, now);
    const t = Date.parse(answer && answer.server_time);
    writeText(PULLED_KEY, new Date((Number.isNaN(t) ? Date.now() : t) - 120000).toISOString());
    writeText(MODE_KEY, 'real'); // last: only now does this device sync
    window.dispatchEvent(new Event('crumb-outbox-changed')); // send anything edited during the move
    window.dispatchEvent(new Event('crumb-sync-status'));
    return { ...v, counts: plan.counts };
  } catch (err) {
    setRecording(false);
    await clearOutbox();
    throw err; // nothing on this device changed; the move can be tried again (it updates, never duplicates)
  }
}

// iPad: an EMPTY device downloads your data.
export async function downloadMyData(onStep = () => {}) {
  const { sb, ws } = await ready();
  if (loadCustomers().length || loadProspects().length) throw new Error('This device already has customers or prospects, so nothing was downloaded.');
  onStep('Downloading…');
  const { answer, photoIds } = await cloudNow(sb, ws);
  if (cloudIsEmpty(answer)) throw new Error('Your cloud is empty. Move your data from your iPhone first.');
  const plan = planPull(answer, readText, new Set());
  if (plan.blocked) throw new Error(plan.blocked);
  quietly(() => Object.entries(plan.writes).forEach(([k, text]) => writeText(k, text)));
  onStep('Downloading photos…');
  writeText(PHOTOS_SENT_KEY, '{}');
  writeText(PHOTOS_PULLED_KEY, '');
  await syncPhotos(sb, ws);
  onStep('Checking this device matches the cloud…');
  const mine = inspectForMove(readText, await allPhotos());
  const v = verifyMatch(mine.changes, answer, photoIds, mine.photoIds);
  if (!v.ok) return { ...v, counts: mine.counts };
  turnOnSyncing(answer);
  return { ...v, counts: mine.counts, reload: true };
}

// The last step of setting a device up: from now on it syncs (changes are noted and sent, the cloud's are pulled).
function turnOnSyncing(answer) {
  const now = new Date().toISOString();
  writeText(PROJECT_KEY, projectRef());
  writeText(PAUSED_KEY, '0');
  writeText(UPLOADED_KEY, now);
  writeText(LAST_SENT_KEY, now);
  writeText(LAST_CHECK_KEY, now);
  const t = Date.parse(answer && answer.server_time);
  writeText(PULLED_KEY, new Date((Number.isNaN(t) ? Date.now() : t) - 120000).toISOString());
  setRecording(true);
  writeText(MODE_KEY, 'real');
}

// Right after signing in (Nov 8 plan, step 1). An EMPTY device sets itself up with no buttons:
//   account has data -> download it all (checked against the cloud) -> 'downloaded'
//   account is empty -> a brand-new user: start syncing right away -> 'fresh'
// Anything else is handed back untouched: 'ready' (already set up), 'not-invited', 'has-local' (this device
// has its own data: asked about separately, never replaced here). Errors throw, and nothing on the device changes.
export async function setUpAfterSignIn(onStep = () => {}) {
  if (isRealSynced()) return { status: 'ready' };
  const sb = cloud();
  if (!sb) throw new Error('Cloud isn’t set up in this version.');
  const { data: s } = await sb.auth.getSession();
  if (!s || !s.session) return { status: 'signed-out' };
  if (!maySync(s.session.user && s.session.user.email)) return { status: 'not-invited' };
  if (deviceHasData() || isTestCopy()) return askAbout(sb);
  onStep('Getting your account ready…');
  const { sb: sb2, ws } = await ready();
  const { answer } = await cloudNow(sb2, ws);
  if (deviceHasData()) return askAbout(sb); // something was added meanwhile: don't touch it
  if (cloudIsEmpty(answer)) {
    turnOnSyncing(answer);
    return { status: 'fresh' };
  }
  // If the download doesn't finish cleanly, put this (empty) device back exactly as it was.
  const before = allSavedKeys();
  const snap = snapshotSaved(before);
  const undo = () => {
    const added = {};
    allSavedKeys().filter((k) => !before.includes(k)).forEach((k) => (added[k] = null)); // null = remove
    quietly(() => restoreSaved({ ...added, ...snap }));
  };
  let r;
  try {
    r = await downloadMyData(onStep);
  } catch (e) {
    if (!isRealSynced()) undo();
    throw e;
  }
  if (!r.ok) {
    undo();
    const e = new Error('Your account didn’t come down cleanly, so this device wasn’t changed. Try again.');
    e.detail = r;
    throw e;
  }
  return { status: 'downloaded' };
}

// Every key Crumb saves on this device (for putting a failed setup back).
function allSavedKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('crumb') || k === 'visitData')) out.push(k);
    }
  } catch {
    // storage unreadable: nothing to list
  }
  return out;
}

// ---------------------------------------------------------------- step 2: a device that has its own data
// It's never replaced or merged on its own: the person is asked once (SetupPage), with what's on each side.
export const SEPARATE_KEY = 'crumb_setup_separate'; // '1' = "Keep Separate" was picked on this device

async function peekCloud(sb) {
  if (isTestProject()) throw new Error('This version is connected to the TEST cloud. Your real data only goes to your real cloud.');
  const ws = await myWorkspace(sb);
  const { answer } = await cloudNow(sb, ws);
  return answer;
}
const liveCount = (rows, kind) => (rows || []).filter((r) => !r.deleted && (!kind || (r.cols && r.cols.kind) === kind || r.kind === kind)).length;

async function askAbout(sb) {
  const answer = await peekCloud(sb);
  const accounts = (answer && answer.accounts) || [];
  return {
    status: 'ask',
    testCopy: isTestCopy(),
    cloudHasData: !cloudIsEmpty(answer),
    device: { customers: loadCustomers().length, prospects: loadProspects().length },
    cloud: { customers: liveCount(accounts, 'customer'), prospects: liveCount(accounts, 'prospect') },
  };
}

// Keep everything this device has (data + photos) as the safety copy, restorable from Settings → Backup.
async function keepSafetyCopy() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isBackedUpKey(k)) data[k] = localStorage.getItem(k);
  }
  const photos = await allPhotos();
  await saveSafetyCopy({
    app: 'crumb',
    reason: 'setup',
    createdAt: new Date().toISOString(),
    data,
    photos,
    manifest: makeManifest(data, photos.map((p) => String(p.id))),
  });
  return photos;
}

const clearSeparate = () => {
  try {
    localStorage.removeItem(SEPARATE_KEY);
  } catch {
    // nothing to clear
  }
};

// "Use My Account": this device's copy goes into the safety copy, then the account comes down (or, if the
// account is empty, the device starts fresh). If anything fails, the device is put back exactly as it was.
export async function useMyAccount(onStep = () => {}) {
  const sb = cloud();
  if (!sb) throw new Error('Cloud isn’t set up in this version.');
  const { data: s } = await sb.auth.getSession();
  if (!s || !s.session) throw new Error('Sign in first.');
  if (!maySync(s.session.user && s.session.user.email)) throw new Error('Cloud sync is coming soon. Your data stays on this device.');
  onStep('Saving this device’s copy…');
  let photos;
  try {
    photos = await keepSafetyCopy();
  } catch {
    throw new Error('Crumb couldn’t save a safety copy of this device’s data, so nothing was changed.');
  }
  const before = allSavedKeys();
  const snap = snapshotSaved(before);
  const putBack = async () => {
    const added = {};
    allSavedKeys().filter((k) => !before.includes(k)).forEach((k) => (added[k] = null));
    quietly(() => restoreSaved({ ...added, ...snap }));
    try {
      await clearAllPhotos();
      await putPhotosAll(photos);
    } catch {
      // the photos are still in the safety copy
    }
  };
  try {
    // Clear this device's own copy (it's in the safety copy), including an old test copy's leftovers.
    await clearOutbox();
    setRecording(false);
    quietly(() =>
      restoreSaved(Object.fromEntries(before.filter((k) => isBackedUpKey(k) || k.startsWith('crumb_sync_') || k === TEST_DEVICE_KEY).map((k) => [k, null])))
    );
    await clearAllPhotos();
    onStep('Getting your account ready…');
    const { sb: sb2, ws } = await ready();
    const { answer } = await cloudNow(sb2, ws);
    if (cloudIsEmpty(answer)) turnOnSyncing(answer);
    else {
      const r = await downloadMyData(onStep);
      if (!r.ok) throw new Error('Your account didn’t come down cleanly, so this device wasn’t changed. Try again.');
    }
  } catch (e) {
    if (!isRealSynced()) await putBack();
    throw e;
  }
  clearSeparate();
  return { status: 'done' };
}

// "Add It": this device's data goes up into an EMPTY account (the same checked move as before), with a
// safety copy kept first. Nothing on this device changes.
export async function addThisDevice(onStep = () => {}) {
  onStep('Saving this device’s copy…');
  try {
    await keepSafetyCopy();
  } catch {
    throw new Error('Crumb couldn’t save a safety copy of this device’s data, so nothing was changed.');
  }
  const r = await moveMyData((label) => onStep(/Upload/.test(label) ? 'Adding this device’s information…' : label), { safetyCopied: true });
  if (!r.ok) throw new Error('Your account didn’t match this device afterward, so syncing wasn’t turned on. Nothing on this device changed. Try again.');
  clearSeparate();
  return { status: 'done' };
}

// "Keep Separate" / "Not Now": remembered on this device; Home shows a note until it's set up.
export function keepSeparate() {
  writeText(SEPARATE_KEY, '1');
}
