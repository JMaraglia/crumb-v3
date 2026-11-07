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
import { readText, writeText } from './store';

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

// Who may move or download real data for now (founder decision, Nov 7). Everyone else's Crumb stays
// on their own phone ("coming soon"). To let someone in, add their email here.
export const SYNC_EMAILS = ['jmaraglia@gmail.com'];
export const maySync = (email) => SYNC_EMAILS.includes(String(email || '').trim().toLowerCase());

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
