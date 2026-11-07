// file: src/backupCheck.js
// Counting and checking backups. A backup file (version 2) carries a "manifest": what was in it
// when it was made (counts, plus a fingerprint of every saved item, plus every photo id).
// Checking a file = recount what's really in it and compare with its manifest.
// After a restore, the same check runs against what the phone actually saved.
import { toVisitList } from './schedule';

// Saved items that belong to THIS device only: never put in a backup, never replaced by a restore.
//   crumb_push_device: this phone's notification ID (two devices sharing one = duplicate reminders)
//   crumb_last_backup / crumb_safety_copy / crumb_restore_result: the backup screen's own bookkeeping
export const DEVICE_ONLY = ['crumb_push_device', 'crumb_last_backup', 'crumb_safety_copy', 'crumb_restore_result', 'crumb_sync_record',
  'crumb_sync_test_device', 'crumb_sync_uploaded', 'crumb_sync_last_sent'];

export function isBackedUpKey(k) {
  return !!k && (k.startsWith('crumb_') || k === 'visitData') && !DEVICE_ONLY.includes(k);
}

// Short fingerprint of a saved item's text (FNV-1a). Any change or cut-off shows up as a different value.
export function fingerprint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${str.length}`;
}

const parse = (raw, fallback) => {
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
};

// The counts people care about, from a { key: savedText } map plus a photo count.
export function countData(data, photoCount) {
  const d = data || {};
  const list = (k) => {
    const v = parse(d[k], []);
    return Array.isArray(v) ? v.filter((a) => a && typeof a === 'object') : [];
  };
  const customers = list('crumb_contacts');
  const prospects = list('crumb_prospects');
  const notes = [...customers, ...prospects].reduce((n, a) => n + (Array.isArray(a.notes) ? a.notes.length : 0), 0);
  return {
    customers: customers.length,
    prospects: prospects.length,
    notes,
    events: list('crumb_calendar_events').length,
    stops: toVisitList(parse(d.visitData, [])).length,
    todos: list('crumb_todos').length,
    photos: photoCount || 0,
    items: Object.keys(d).filter(isBackedUpKey).length,
  };
}

export const COUNT_LABELS = [
  ['customers', 'Customers'],
  ['prospects', 'Prospects'],
  ['notes', 'Notes'],
  ['events', 'Calendar events'],
  ['stops', 'Added itinerary stops'],
  ['todos', 'To-dos'],
  ['photos', 'Photos'],
  ['items', 'Saved items (all)'],
];

export function makeManifest(data, photoIds) {
  const keys = {};
  Object.keys(data || {})
    .filter(isBackedUpKey)
    .forEach((k) => {
      keys[k] = fingerprint(String(data[k]));
    });
  const ids = [...(photoIds || [])].map(String).sort();
  return { counts: countData(data, ids.length), keys, photoIds: ids };
}

// Compare what should be there (manifest) with what is there (data + photo ids).
// Returns a list of plain-English problems; empty list = everything matches.
export function compareToManifest(manifest, data, photoIds) {
  const problems = [];
  if (!manifest) return problems;
  const want = manifest.keys || {};
  const have = {};
  Object.keys(data || {})
    .filter(isBackedUpKey)
    .forEach((k) => {
      have[k] = fingerprint(String(data[k]));
    });
  Object.keys(want).forEach((k) => {
    if (!(k in have)) problems.push(`Missing saved item: ${k}`);
    else if (have[k] !== want[k]) problems.push(`Saved item doesn't match: ${k}`);
  });
  Object.keys(have).forEach((k) => {
    if (!(k in want)) problems.push(`Extra saved item not in the backup: ${k}`);
  });
  const haveIds = new Set((photoIds || []).map(String));
  const missingPhotos = (manifest.photoIds || []).filter((id) => !haveIds.has(String(id)));
  if (missingPhotos.length) problems.push(`${missingPhotos.length} photo${missingPhotos.length === 1 ? '' : 's'} missing`);
  return problems;
}
