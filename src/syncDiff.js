// file: src/syncDiff.js
// Sync step S2 (Nov 7 2026): work out exactly WHAT changed when Crumb saves something, as small
// changes the cloud understands (see supabase/migrations/0002_sync.sql → apply_changes).
//
//   changesFor(key, beforeText, afterText, readOther) → [ { table, id, type, base, next, cols } ]
//     key         the saved item that changed (e.g. 'crumb_contacts')
//     before/after its saved text before and after the save
//     readOther   (key) → saved text of ANOTHER item right now (used to spot a prospect becoming a customer)
//
// Pure logic: reads nothing itself and changes nothing. Unknown keys (this phone's own things like the
// notification ID, maps app, map cache, backup bookkeeping) produce no changes, so they never sync.

const parse = (text, fallback) => {
  if (text == null || text === '') return fallback;
  try {
    const v = JSON.parse(text);
    return v == null ? fallback : v;
  } catch {
    return undefined; // unreadable: caller treats as "can't tell", produces nothing
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const listOf = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v).flat().filter((x) => x && typeof x === 'object');
  return [];
};
const byId = (list) => {
  const m = new Map();
  list.forEach((x) => {
    if (x && typeof x === 'object' && x.id != null && x.id !== '') m.set(String(x.id), x);
  });
  return m;
};
const strip = (obj, ...keys) => {
  const out = { ...obj };
  keys.forEach((k) => delete out[k]);
  return out;
};
const accountIdOf = (x) => (x && x.accountId != null && x.accountId !== '' ? String(x.accountId) : null);

// The saved items that sync, and what they become in the cloud.
export const ACCOUNT_KEYS = { crumb_contacts: 'customer', crumb_prospects: 'prospect' };
export const DAY_MAP_KEYS = {
  crumb_itinerary_done: 'done',
  crumb_itinerary_removed: 'removed',
  crumb_calendar_hidden: 'hidden',
  crumb_itinerary_locks: 'locks',
  crumb_itinerary_times: 'times',
  crumb_itinerary_lengths: 'lengths',
  crumb_callsheet_ordered: 'ordered',
};
export const SETTING_KEYS = {
  crumb_calendar_settings: 'calendar',
  crumb_stale_days: 'staleDays',
  crumb_competitors: 'competitors',
  crumb_notify_settings: 'notify',
};
// Notification settings follow you everywhere EXCEPT "on for this device" (founder decision, Nov 7).
const DEVICE_ONLY_SETTING_FIELDS = { notify: ['enabled'] };

export function syncsKey(key) {
  return key in ACCOUNT_KEYS || key in DAY_MAP_KEYS || key in SETTING_KEYS ||
    key === 'crumb_calendar_events' || key === 'visitData' || key === 'crumb_todos';
}

export function changesFor(key, beforeText, afterText, readOther = () => null) {
  if (!syncsKey(key) || beforeText === afterText) return [];
  if (key in ACCOUNT_KEYS) return accountChanges(key, beforeText, afterText, readOther);
  if (key === 'crumb_calendar_events') return recordChanges('events', beforeText, afterText, (e) => ({ account_id: accountIdOf(e), day: e.date || null }));
  if (key === 'visitData') return recordChanges('stops', beforeText, afterText, (v) => ({ account_id: accountIdOf(v), day: v.date || null }));
  if (key === 'crumb_todos') return recordChanges('todos', beforeText, afterText, (t) => ({ account_id: accountIdOf(t) }));
  if (key in DAY_MAP_KEYS) return dayMapChanges(DAY_MAP_KEYS[key], beforeText, afterText);
  return settingChanges(SETTING_KEYS[key], key, beforeText, afterText);
}

// Calendar events, Itinerary stops, to-dos: one cloud record per item, matched by its ID tag.
function recordChanges(table, beforeText, afterText, colsOf) {
  const b = parse(beforeText, []);
  const a = parse(afterText, []);
  if (b === undefined || a === undefined) return [];
  const before = byId(listOf(b));
  const after = byId(listOf(a));
  const out = [];
  after.forEach((rec, id) => {
    const old = before.get(id);
    if (!old) out.push({ table, id, type: 'upsert', base: null, next: rec, cols: colsOf(rec) });
    else if (!same(old, rec)) out.push({ table, id, type: 'upsert', base: old, next: rec, cols: colsOf(rec) });
  });
  before.forEach((rec, id) => {
    if (!after.has(id)) out.push({ table, id, type: 'delete', base: rec, cols: colsOf(rec) });
  });
  return out;
}

// Customers / prospects: the account's own fields, and its notes as separate records.
function accountChanges(key, beforeText, afterText, readOther) {
  const kind = ACCOUNT_KEYS[key];
  const otherKey = kind === 'customer' ? 'crumb_prospects' : 'crumb_contacts';
  const b = parse(beforeText, []);
  const a = parse(afterText, []);
  if (b === undefined || a === undefined) return [];
  const before = byId(listOf(b));
  const after = byId(listOf(a));
  const otherNow = byId(listOf(parse(readOther(otherKey), []) || []));
  const otherNoteIds = new Set();
  otherNow.forEach((acct) => (acct.notes || []).forEach((n) => n && n.id && otherNoteIds.add(String(n.id))));

  const out = [];
  const fields = (acct) => strip(acct, 'notes');
  const notesOf = (acct) => byId(Array.isArray(acct && acct.notes) ? acct.notes : []);

  after.forEach((acct, id) => {
    const old = before.get(id);
    if (!old) {
      const fromOther = otherNow.get(id);
      if (kind === 'customer' && fromOther) {
        // a prospect just became this customer (same ID): one Convert step
        out.push({ table: 'accounts', id, type: 'convert', base: fields(fromOther), next: fields(acct), cols: { kind } });
      } else {
        out.push({ table: 'accounts', id, type: 'upsert', base: null, next: fields(acct), cols: { kind } });
      }
    } else if (!same(fields(old), fields(acct))) {
      out.push({ table: 'accounts', id, type: 'upsert', base: fields(old), next: fields(acct), cols: { kind } });
    }
    // notes of this account
    const nb = notesOf(old);
    const na = notesOf(acct);
    na.forEach((note, nid) => {
      const prev = nb.get(nid);
      if (!prev) out.push({ table: 'notes', id: nid, type: 'upsert', base: null, next: note, cols: { account_id: id } });
      else if (!same(prev, note)) out.push({ table: 'notes', id: nid, type: 'upsert', base: prev, next: note, cols: { account_id: id } });
    });
    nb.forEach((note, nid) => {
      if (!na.has(nid) && !otherNoteIds.has(nid) && !noteElsewhere(after, nid, id)) {
        out.push({ table: 'notes', id: nid, type: 'delete', base: note, cols: { account_id: id } });
      }
    });
  });

  before.forEach((acct, id) => {
    if (after.has(id)) return;
    if (otherNow.has(id)) return; // moved to the other list (Convert): not a delete
    out.push({ table: 'accounts', id, type: 'delete', base: fields(acct), cols: { kind } });
    notesOf(acct).forEach((note, nid) => {
      if (!otherNoteIds.has(nid) && !noteElsewhere(after, nid, null)) {
        out.push({ table: 'notes', id: nid, type: 'delete', base: note, cols: { account_id: id } });
      }
    });
  });
  return out;
}
// Is this note now under a different account in the same list? (Then it moved, it wasn't deleted.)
function noteElsewhere(accounts, nid, exceptId) {
  for (const [id, acct] of accounts) {
    if (id !== exceptId && Array.isArray(acct.notes) && acct.notes.some((n) => n && String(n.id) === nid)) return true;
  }
  return false;
}

// Per-day marks: one cloud record per kind per day. Days dropped by the 60-day cleanup aren't sent.
function dayMapChanges(kind, beforeText, afterText) {
  const b = parse(beforeText, {});
  const a = parse(afterText, {});
  if (b === undefined || a === undefined) return [];
  const bo = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const ao = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  const out = [];
  Object.keys(ao).forEach((day) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    if (!same(bo[day], ao[day])) {
      out.push({ table: 'day_marks', id: `${kind}|${day}`, type: 'upsert', base: day in bo ? bo[day] : null, next: ao[day], cols: {} });
    }
  });
  return out;
}

// Settings: one cloud record per setting.
function settingChanges(name, key, beforeText, afterText) {
  const isText = key === 'crumb_stale_days';
  const read = (t) => {
    if (isText) return t == null || t === '' ? null : Number(t);
    return parse(t, null);
  };
  let b = read(beforeText);
  let a = read(afterText);
  if (b === undefined || a === undefined) return [];
  const drop = DEVICE_ONLY_SETTING_FIELDS[name];
  if (drop) {
    if (b && typeof b === 'object') b = strip(b, ...drop);
    if (a && typeof a === 'object') a = strip(a, ...drop);
  }
  if (a == null || same(a, b)) return [];
  return [{ table: 'settings', id: name, type: 'upsert', base: b, next: a, cols: {} }];
}

// Several changes to the same record while waiting to be sent → one change:
// the earliest "before", the latest "after".
export function combine(older, newer) {
  if (!older) return newer;
  const firstBase = older.base === undefined ? null : older.base;
  if (newer.type === 'delete') {
    if (older.type === 'upsert' && older.base === null) return null; // added then deleted before sending: nothing to send
    return { ...newer, base: firstBase };
  }
  if (older.type === 'delete') return { ...newer, base: firstBase }; // deleted then re-added
  const type = older.type === 'convert' || newer.type === 'convert' ? 'convert' : 'upsert';
  return { ...newer, type, base: firstBase };
}

// The FIRST upload (S3 test copy; later the real move, S7): everything currently saved, as "added" changes.
// Accounts (with their notes) come first, so every note, event, stop and to-do has its account in the cloud.
export const UPLOAD_ORDER = [
  'crumb_contacts', 'crumb_prospects', 'crumb_calendar_events', 'visitData', 'crumb_todos',
  ...Object.keys(DAY_MAP_KEYS), ...Object.keys(SETTING_KEYS),
];
export function fullUploadChanges(readText) {
  const out = [];
  UPLOAD_ORDER.forEach((key) => {
    const now = readText(key);
    if (now == null || now === '') return;
    const empty = key in DAY_MAP_KEYS ? '{}' : key in SETTING_KEYS ? null : '[]';
    // no "other list" during a first upload: nothing is a Convert
    out.push(...changesFor(key, empty, now, () => null));
  });
  return out;
}

// Sending order inside a batch: accounts before what links to them.
const TABLE_ORDER = { accounts: 0, notes: 1, events: 2, stops: 3, todos: 4, day_marks: 5, settings: 6 };
export function sendOrder(a, b) {
  return (TABLE_ORDER[a.table] ?? 9) - (TABLE_ORDER[b.table] ?? 9) || String(a.at || '').localeCompare(String(b.at || ''));
}
