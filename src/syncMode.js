// file: src/syncMode.js
// Sync step S7 (Nov 7 2026): is THIS device syncing, and with which cloud? Small on purpose (no cloud
// library), so the rest of Crumb can ask without loading anything.
//
// A device is one of:
//   Off          (the default)  nothing goes in or out. Your real phone until you tap Move My Data.
//   Test copy    demo data only, and ONLY with the test project (crumb-test). Locked out of any other.
//   Synced       your real data, with the project it was moved to / downloaded from (crumb-prod).
//   Paused       synced, but nothing goes in or out; changes wait on the device until you resume.
// Kill switch: the Vercel setting VITE_SYNC_OFF = 1 stops syncing on every device.
import { readText, writeText, loadCustomers, loadProspects, loadEvents, loadStops, loadTodos } from './store';

export const TEST_PROJECT = 'ljmrvhlyrinptjukstyo'; // crumb-test (not a secret: it's part of its public address)
const URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
export const projectRef = () => {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(URL);
  return m ? m[1] : '';
};
export const isTestProject = (ref = projectRef()) => ref === TEST_PROJECT;
export const KILL_SWITCH = String(import.meta.env.VITE_SYNC_OFF || '') === '1';
// Emergency switch for the beta lock (Vercel setting VITE_ACCESS_LOCK_OFF = 1): Crumb opens like before the lock.
export const ACCESS_LOCK_OFF = String(import.meta.env.VITE_ACCESS_LOCK_OFF || '') === '1';

export const TEST_DEVICE_KEY = 'crumb_sync_test_device'; // '1' = this copy holds demo data only
export const MODE_KEY = 'crumb_sync_mode';               // 'real' = this device syncs your real data
export const PROJECT_KEY = 'crumb_sync_project';         // which cloud project it syncs with
export const PAUSED_KEY = 'crumb_sync_paused';           // '1' = paused
// Whose account this device was set up for (the account's ID; Nov 11 beta review). If someone ELSE signs in
// here, nothing syncs and Crumb doesn't open: the first person's data is never shown to, or sent as, another account.
export const OWNER_KEY = 'crumb_sync_owner';

// Who may sync (invite-only beta). Since Nov 8 the real list lives in the cloud (Admin → Inbox → Beta →
// Sync Access), and the cloud itself refuses anyone not on it. SYNC_EMAILS is only the fallback for a
// cloud that doesn't have the invite list yet. INVITED_KEY remembers (on this device only) the email the
// cloud last said yes to, so Crumb can tell on open without asking the cloud.
export const SYNC_EMAILS = ['jmaraglia@gmail.com'];
export const INVITED_KEY = 'crumb_sync_invited';
export const DENIED_KEY = 'crumb_access_denied'; // the email the cloud last said NO to (this device only)
const clean = (email) => String(email || '').trim().toLowerCase();
export const maySync = (email) => {
  const e = clean(email);
  return Boolean(e) && (SYNC_EMAILS.includes(e) || readText(INVITED_KEY) === e);
};

// Ask the cloud: is the signed-in person invited? Remembers the answer on this device.
// If the cloud doesn't have the invite list yet, falls back to SYNC_EMAILS. Other errors (no signal) throw.
export async function checkInvited(sb, email) {
  const e = clean(email);
  if (!e) return false;
  const { data, error } = await sb.rpc('can_sync');
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '');
    if (missing) return SYNC_EMAILS.includes(e);
    throw error;
  }
  if (data === true) {
    writeText(INVITED_KEY, e);
    if (readText(DENIED_KEY)) writeText(DENIED_KEY, '');
  } else {
    if (readText(INVITED_KEY)) writeText(INVITED_KEY, '');
    writeText(DENIED_KEY, e);
  }
  return data === true;
}

export const isTestCopy = () => readText(TEST_DEVICE_KEY) === '1';
export const isRealSynced = () => readText(MODE_KEY) === 'real';
export const isPaused = () => readText(PAUSED_KEY) === '1';

// '' = syncing. Otherwise why not: 'kill-switch' | 'test-copy-locked' | 'other-project' | 'paused' | 'off'
export function syncBlockReason(ref = projectRef(), read = readText, killed = KILL_SWITCH, userId = signedInUserId(ref)) {
  if (killed) return 'kill-switch';
  if (read(TEST_DEVICE_KEY) === '1') return ref === TEST_PROJECT ? '' : 'test-copy-locked';
  if (read(MODE_KEY) === 'real') {
    if (!ref || read(PROJECT_KEY) !== ref) return 'other-project';
    const owner = read(OWNER_KEY);
    if (owner && userId && owner !== userId) return 'other-account';
    // No owner confirmed yet (a device set up before Nov 11): nothing syncs until the cloud confirms it.
    if (!owner && userId) return 'owner-unverified';
    return read(PAUSED_KEY) === '1' ? 'paused' : '';
  }
  return 'off';
}
export const syncActive = () => syncBlockReason() === '';

// A device that syncs your data, but nobody is signed in: Crumb opens on Sign In first (like a banking app).
// Read straight from where the sign-in is remembered, so the cloud library doesn't have to load to know.
export function hasSignIn(ref = projectRef()) {
  try {
    return Boolean(ref && localStorage.getItem(`sb-${ref}-auth-token`));
  } catch {
    return true; // can't tell: never lock anyone out
  }
}
export const needsSignIn = () => (isRealSynced() || lockApplies()) && !hasSignIn();

// ---------------------------------------------------------------- the beta lock (Nov 8 access plan)
// Crumb is invite-only: nobody uses it without signing in with an approved account. (Later the same cloud
// check will also say yes to an active subscription.) Not for the test cloud, demo builds without a cloud,
// or when the emergency switch is on.
export const lockApplies = () => !ACCESS_LOCK_OFF && Boolean(projectRef()) && !isTestProject();
// 'open' (no lock) | 'signin' | 'ok' | 'denied' (the cloud said no) | 'unknown' (ask the cloud)
export function accessState() {
  if (!lockApplies()) return 'open';
  if (!hasSignIn()) return 'signin';
  const e = clean(signedInEmail());
  if (!e) return 'unknown';
  if (maySync(e)) return 'ok';
  if (readText(DENIED_KEY) === e) return 'denied';
  return 'unknown';
}

export function setPaused(on) {
  writeText(PAUSED_KEY, on ? '1' : '0');
  window.dispatchEvent(new Event('crumb-sync-status'));
}

export const BLOCK_TEXT = {
  'kill-switch': 'Syncing is switched off for now. Crumb keeps working on this device, and your changes wait here.',
  'test-copy-locked': 'This is a test copy with made-up demo data, so it can never sync with your real account.',
  'other-project': 'This device was set up with a different cloud, so it isn’t syncing.',
  'other-account': 'This device is set up for another account, so it isn’t syncing.',
  'owner-unverified': 'Checking that this device belongs to your account. Syncing starts once that’s confirmed.',
  paused: 'Paused. Crumb keeps working on this device, and your changes wait here until you resume.',
  off: '',
};

// Does this device hold anything of its own? (customers, prospects, calendar events, itinerary stops, to-dos)
export const deviceHasData = () =>
  loadCustomers().length > 0 || loadProspects().length > 0 || loadEvents().length > 0 || loadStops().length > 0 || loadTodos().length > 0;

// Email of whoever is signed in on this device, read from where the sign-in is remembered ('' if nobody).
export function signedInEmail(ref = projectRef()) {
  try {
    const s = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || 'null');
    return String((s && s.user && s.user.email) || '');
  } catch {
    return '';
  }
}

// ID of whoever is signed in on this device ('' if nobody).
export function signedInUserId(ref = projectRef()) {
  try {
    const s = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || 'null');
    return String((s && s.user && s.user.id) || '');
  } catch {
    return '';
  }
}
/* ---------- Whose device is this? (security audit, Nov 12 2026) ----------
   OWNER_KEY is only ever written when ownership is certain: at setup (the person just set this device up with
   their account), or after the CLOUD confirms that the records saved here are in the signed-in account
   (verifyOwner). It is never guessed from who happens to be signed in or from anything remembered locally.

   Devices set up before Nov 11 have no owner saved. For those (founder, Nov 12: the strict rule): NOTHING private
   is drawn for anyone until the cloud check passes once. With no signal, Setup says a one-time connection is
   needed. After that the owner is saved on the device and Crumb opens normally, with or without a signal.
   ownerState(): 'na' (not a syncing device, or nobody signed in) | 'ok' | 'other' | 'unverified' */
let ownerMismatch = ''; // the account ID the cloud said NO for, this launch only (never saved)

export function ownerState() {
  if (!isRealSynced()) return 'na';
  const me = signedInUserId();
  if (!me) return 'na';
  const owner = readText(OWNER_KEY);
  if (owner) return owner === me ? 'ok' : 'other';
  return ownerMismatch === me ? 'other' : 'unverified';
}
// A syncing device with someone signed in who isn't the account it belongs to.
export const otherAccountSignedIn = () => ownerState() === 'other';
// Private screens may be drawn only for the confirmed owner (or where there is no owner rule at all).
export const ownerMayView = () => ['na', 'ok'].includes(ownerState());

// Up to 40 of the oldest record IDs saved on this device (oldest = certainly sent to the cloud long ago).
function localSample() {
  const ids = (key) => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || '[]');
      return (Array.isArray(v) ? v : []).map((x) => x && x.id).filter((id) => id !== undefined && id !== null && id !== '').map(String);
    } catch {
      return [];
    }
  };
  const oldest = (list) => list.slice().sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, 40);
  const accounts = [...ids('crumb_contacts'), ...ids('crumb_prospects')];
  if (accounts.length) return { table: 'accounts', ids: oldest(accounts) };
  const events = ids('crumb_calendar_events');
  if (events.length) return { table: 'events', ids: oldest(events) };
  return { table: '', ids: [] };
}

// Ask the cloud whether this device's records are in the signed-in account. Only a clear yes saves the owner.
// 'ok' | 'mismatch' | 'unknown' (no signal, not approved yet, or the cloud couldn't answer: nothing changes).
export async function verifyOwner(sb) {
  try {
    if (!isRealSynced()) return 'ok';
    const { data: s } = await sb.auth.getSession();
    const me = String((s && s.session && s.session.user && s.session.user.id) || '');
    if (!me) return 'unknown';
    const owner = readText(OWNER_KEY);
    if (owner) return owner === me ? 'ok' : 'mismatch';
    const confirm = () => {
      writeText(OWNER_KEY, me);
      ownerMismatch = '';
      try {
        window.dispatchEvent(new Event('crumb-sync-status'));
        window.dispatchEvent(new Event('crumb-outbox-changed')); // anything waiting can go now
      } catch {
        /* nothing listening: syncing picks it up on its next pass */
      }
      return 'ok';
    };
    const sample = localSample();
    if (!sample.ids.length) return confirm(); // nothing saved here to protect or to mix
    const approved = await sb.rpc('can_sync');
    if (approved.error || approved.data !== true) return 'unknown';
    const found = await sb.from(sample.table).select('id').in('id', sample.ids);
    if (found.error || !Array.isArray(found.data)) return 'unknown';
    const mine = new Set(found.data.map((r) => String(r.id)));
    const hits = sample.ids.filter((id) => mine.has(id)).length;
    if (hits * 2 >= sample.ids.length) return confirm();
    ownerMismatch = me;
    return 'mismatch';
  } catch {
    return 'unknown';
  }
}

// A brand-new device (nothing on it, nobody signed in, not syncing): Crumb opens on Sign In, like any app.
export const firstOpenSignIn = () =>
  !KILL_SWITCH && Boolean(projectRef()) && !isTestProject() && !isTestCopy() && !isRealSynced() && !hasSignIn() &&
  readText('crumb_setup_separate') !== '1' && !deviceHasData();

// Signed in, allowed to sync, not syncing yet, and nothing on this device: Crumb sets it up on its own.
// (Not for the test cloud or test copies.)
export const needsSetup = () =>
  !KILL_SWITCH && !isTestProject() && !isTestCopy() && !isRealSynced() && hasSignIn() && maySync(signedInEmail()) && !deviceHasData();
