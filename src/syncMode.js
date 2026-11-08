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

export const TEST_DEVICE_KEY = 'crumb_sync_test_device'; // '1' = this copy holds demo data only
export const MODE_KEY = 'crumb_sync_mode';               // 'real' = this device syncs your real data
export const PROJECT_KEY = 'crumb_sync_project';         // which cloud project it syncs with
export const PAUSED_KEY = 'crumb_sync_paused';           // '1' = paused

// Who may sync (invite-only beta). Since Nov 8 the real list lives in the cloud (Admin → Inbox → Beta →
// Sync Access), and the cloud itself refuses anyone not on it. SYNC_EMAILS is only the fallback for a
// cloud that doesn't have the invite list yet. INVITED_KEY remembers (on this device only) the email the
// cloud last said yes to, so Crumb can tell on open without asking the cloud.
export const SYNC_EMAILS = ['jmaraglia@gmail.com'];
export const INVITED_KEY = 'crumb_sync_invited';
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
  if (data === true) writeText(INVITED_KEY, e);
  else if (readText(INVITED_KEY)) writeText(INVITED_KEY, '');
  return data === true;
}

export const isTestCopy = () => readText(TEST_DEVICE_KEY) === '1';
export const isRealSynced = () => readText(MODE_KEY) === 'real';
export const isPaused = () => readText(PAUSED_KEY) === '1';

// '' = syncing. Otherwise why not: 'kill-switch' | 'test-copy-locked' | 'other-project' | 'paused' | 'off'
export function syncBlockReason(ref = projectRef(), read = readText, killed = KILL_SWITCH) {
  if (killed) return 'kill-switch';
  if (read(TEST_DEVICE_KEY) === '1') return ref === TEST_PROJECT ? '' : 'test-copy-locked';
  if (read(MODE_KEY) === 'real') {
    if (!ref || read(PROJECT_KEY) !== ref) return 'other-project';
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
export const needsSignIn = () => isRealSynced() && !hasSignIn();

export function setPaused(on) {
  writeText(PAUSED_KEY, on ? '1' : '0');
  window.dispatchEvent(new Event('crumb-sync-status'));
}

export const BLOCK_TEXT = {
  'kill-switch': 'Syncing is switched off for now. Crumb keeps working on this device, and your changes wait here.',
  'test-copy-locked': 'This is a test copy with made-up demo data, so it can never sync with your real account.',
  'other-project': 'This device was set up with a different cloud, so it isn’t syncing.',
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

// A brand-new device (nothing on it, nobody signed in, not syncing): Crumb opens on Sign In, like any app.
// "Use Crumb Without An Account" turns this off for this device (SKIP_SIGNIN_KEY).
export const SKIP_SIGNIN_KEY = 'crumb_signin_skipped';
export const firstOpenSignIn = () =>
  !KILL_SWITCH && Boolean(projectRef()) && !isTestProject() && !isTestCopy() && !isRealSynced() && !hasSignIn() &&
  readText(SKIP_SIGNIN_KEY) !== '1' && readText('crumb_setup_separate') !== '1' && !deviceHasData();

// Signed in, allowed to sync, not syncing yet, and nothing on this device: Crumb sets it up on its own.
// (Not for the test cloud or test copies.)
export const needsSetup = () =>
  !KILL_SWITCH && !isTestProject() && !isTestCopy() && !isRealSynced() && hasSignIn() && maySync(signedInEmail()) && !deviceHasData();
