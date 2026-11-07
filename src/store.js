// file: src/store.js
// THE FRONT DOOR for saved data (central data layer, slice 1: customers & prospects, Nov 6 2026).
// Every read and save of customers / prospects goes through here, so cloud sync can later plug
// into one place instead of many. Saved format is unchanged: same localStorage keys, same JSON.
//
// Safety rules kept from before:
//   - Unreadable saved data is never thrown away: an untouched copy goes to "<key>__unreadable".
//   - A save that fails (phone storage full) tells the app, which shows the "couldn't save" banner.

export const CUSTOMERS_KEY = 'crumb_contacts';
export const PROSPECTS_KEY = 'crumb_prospects';

// Read a saved value. Missing → fallback. Unreadable → fallback, and (if keepUnreadable) the
// original text is copied aside once so it can be recovered. keepNull: a saved "null" is returned as null.
// ifUnreadable: what to return when the saved text can't be read (default: fallback).
export function readSaved(key, fallback, { keepUnreadable = false, keepNull = false, ifUnreadable = fallback } = {}) {
  let saved;
  try {
    saved = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (!saved) return fallback;
  try {
    const v = JSON.parse(saved);
    return v == null && !keepNull ? fallback : v;
  } catch {
    if (keepUnreadable) {
      try {
        if (!localStorage.getItem(`${key}__unreadable`)) localStorage.setItem(`${key}__unreadable`, saved);
      } catch {
        /* no room for the copy */
      }
    }
    return ifUnreadable;
  }
}

// Save a value. Returns true if saved; on failure tells the app (banner) and returns false.
export function writeSaved(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    window.dispatchEvent(new Event('crumb-save-failed')); // shows the "couldn't save" banner
    return false;
  }
}

const asList = (v) => (Array.isArray(v) ? v : []);

// Customers / prospects as saved on the phone (always a list).
export const loadCustomers = () => asList(readSaved(CUSTOMERS_KEY, []));
export const loadProspects = () => asList(readSaved(PROSPECTS_KEY, []));
export const loadAccounts = (type) => (type === 'customer' ? loadCustomers() : loadProspects());

/* ---------- Permanent ID tags for notes (Nov 6 2026) ----------
   Every note gets an `id` like "n-3f9a…" once, and keeps it forever (editing never changes it).
   Needed so that, once Crumb syncs between devices, a change can say exactly which note it's for.
   Nothing else about a note changes. */
export function newNoteId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `n-${window.crypto.randomUUID()}`;
  } catch {
    /* fall through */
  }
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

// Same list back if every note already has a tag (so nothing is re-saved); otherwise a copy where
// only the accounts with untagged notes — and only those notes — are changed.
export function withNoteIds(accounts) {
  if (!Array.isArray(accounts)) return accounts;
  let changed = false;
  const out = accounts.map((a) => {
    if (!a || !Array.isArray(a.notes) || a.notes.every((n) => !n || typeof n !== 'object' || n.id)) return a;
    changed = true;
    return { ...a, notes: a.notes.map((n) => (n && typeof n === 'object' && !n.id ? { ...n, id: newNoteId() } : n)) };
  });
  return changed ? out : accounts;
}

/* ---------- Changing one note, found by its ID tag ----------
   ref = { id, index }. The note is found by its tag; the position (index) is only used for a note
   without a tag. If a tagged note isn't there any more, nothing is changed — never the wrong note.
   A plain number still works as a position (older callers). */
export function findNoteIndex(notes, ref) {
  if (!Array.isArray(notes)) return -1;
  if (ref && typeof ref === 'object') {
    if (ref.id) return notes.findIndex((n) => n && n.id === ref.id);
    return typeof ref.index === 'number' && ref.index >= 0 && ref.index < notes.length ? ref.index : -1;
  }
  return typeof ref === 'number' && ref >= 0 && ref < notes.length ? ref : -1;
}

// change = an object (fields to update) or a function (old note → new note). The note keeps its tag.
export function changeNote(notes, ref, change) {
  const i = findNoteIndex(notes, ref);
  if (i < 0) return notes;
  const old = notes[i];
  let next = typeof change === 'function' ? change(old) : { ...old, ...change };
  if (old && old.id && next && !next.id) next = { ...next, id: old.id };
  const out = [...notes];
  out[i] = next;
  return out;
}

export function dropNote(notes, ref) {
  const i = findNoteIndex(notes, ref);
  if (i < 0) return notes;
  return notes.filter((_, j) => j !== i);
}

/* ---------- Permanent ID tags for hand-added Itinerary stops (Nov 6 2026) ----------
   Very old hand-added stops (visitData) have no `id`, so they were tracked by their position in the
   list ("m-4"). This gives each one a tag once, and moves its per-day marks (checked off, removed for
   the day, hidden on the Calendar, locked / moved time, visit length) from "m-<position>" to the new
   "m-<tag>" — only on that stop's own day. Stops that already have a tag are never touched.
   Runs once when Crumb opens, before any screen reads the stops. Saves nothing if there's nothing to do. */
const VISITS_KEY = 'visitData';
const STOP_LIST_MAPS = ['crumb_itinerary_done', 'crumb_itinerary_removed', 'crumb_calendar_hidden']; // { date: [key] }
const STOP_VALUE_MAPS = ['crumb_itinerary_locks', 'crumb_itinerary_times', 'crumb_itinerary_lengths']; // { date: { key: value } }

export function newStopId() {
  return newNoteId().replace(/^n-/, 's-');
}

function visitList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value).flat().filter((v) => v && typeof v === 'object');
  return [];
}

export function upgradeStopIds() {
  const raw = readSaved(VISITS_KEY, null);
  if (raw == null) return 0;
  const visits = visitList(raw);
  const taggedIds = new Set(visits.filter((v) => v && v.id).map((v) => String(v.id)));
  const renames = []; // { date, from, to }
  const next = visits.map((v, i) => {
    if (!v || typeof v !== 'object' || v.id) return v;
    const id = newStopId();
    // "m-<position>" is only safe to move if no tagged stop uses that same text as its tag
    if (!taggedIds.has(String(i))) renames.push({ date: v.date, from: `m-${i}`, to: `m-${id}` });
    return { ...v, id };
  });
  if (next.every((v, i) => v === visits[i])) return 0; // every stop already tagged: nothing saved

  // Work out every change first, then save them together.
  const writes = [[VISITS_KEY, next]];
  STOP_LIST_MAPS.forEach((key) => {
    const m = readSaved(key, null);
    if (!m || typeof m !== 'object') return;
    let changed = false;
    renames.forEach(({ date, from, to }) => {
      if (Array.isArray(m[date]) && m[date].includes(from)) {
        m[date] = m[date].map((k) => (k === from ? to : k));
        changed = true;
      }
    });
    if (changed) writes.push([key, m]);
  });
  STOP_VALUE_MAPS.forEach((key) => {
    const m = readSaved(key, null);
    if (!m || typeof m !== 'object') return;
    let changed = false;
    renames.forEach(({ date, from, to }) => {
      const day = m[date];
      if (day && typeof day === 'object' && from in day) {
        const { [from]: value, ...rest } = day;
        m[date] = { ...rest, [to]: value };
        changed = true;
      }
    });
    if (changed) writes.push([key, m]);
  });

  // All or nothing: if any save fails, put back what was there.
  const before = writes.map(([key]) => [key, localStorage.getItem(key)]);
  try {
    writes.forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  } catch {
    before.forEach(([key, value]) => {
      try {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        /* the previous data fit before */
      }
    });
    return 0;
  }
  return visits.filter((v) => v && typeof v === 'object' && !v.id).length; // how many stops got a tag
}

/* ---------- Calendar (central data layer, slice 2, Nov 6 2026) ----------
   Calendar events (incl. meetings) and the Calendar's settings. Same keys, same saved format. */
export const EVENTS_KEY = 'crumb_calendar_events';
export const CAL_SETTINGS_KEY = 'crumb_calendar_settings';

// Always a list. Unreadable saved events are copied aside (never thrown away) before anything saves over them.
export const loadEvents = () => asList(readSaved(EVENTS_KEY, [], { keepUnreadable: true }));
export const saveEvents = (list) => writeSaved(EVENTS_KEY, list);

// The Calendar's saved settings as stored (screens add their own defaults). Always an object.
export function loadCalendarSettings() {
  const v = readSaved(CAL_SETTINGS_KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
export const saveCalendarSettings = (settings) => writeSaved(CAL_SETTINGS_KEY, settings);

/* ---------- Itinerary (central data layer, slice 3, Nov 6 2026) ----------
   Hand-added stops (visitData) and the per-day maps that go with stops. Same keys, same format.
     done / removed / hidden: { date: [stopKey] }      locks / times / lengths: { date: { stopKey: minutes } } */
export const STOPS_KEY = VISITS_KEY; // 'visitData'
export const DONE_KEY = 'crumb_itinerary_done';
export const LOCKS_KEY = 'crumb_itinerary_locks';
export const TIMES_KEY = 'crumb_itinerary_times';
export const LENGTHS_KEY = 'crumb_itinerary_lengths';
export const REMOVED_KEY = 'crumb_itinerary_removed';
export const HIDDEN_KEY = 'crumb_calendar_hidden';

// Always a list. Unreadable saved stops are copied aside (never thrown away).
export const loadStops = () => visitList(readSaved(STOPS_KEY, [], { keepUnreadable: true }));
export const saveStops = (list) => writeSaved(STOPS_KEY, list);

// One of the per-day maps, always an object. Unreadable ones are copied aside.
export function loadDayMap(key) {
  const v = readSaved(key, {}, { keepUnreadable: true });
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
export const saveDayMap = (key, map) => writeSaved(key, map);

// For Undo: an exact copy of some saved items, and putting them back exactly.
export function snapshotSaved(keys) {
  const snap = {};
  keys.forEach((k) => {
    try {
      snap[k] = localStorage.getItem(k);
    } catch {
      snap[k] = null;
    }
  });
  return snap;
}
export function restoreSaved(snap) {
  Object.entries(snap).forEach(([k, v]) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      window.dispatchEvent(new Event('crumb-save-failed'));
    }
  });
}

/* ---------- To-dos (central data layer, slice 4, Nov 6 2026) ----------
   Your own tasks: [{ id, text, due, done, doneAt, accountType?, accountId?, accountName? }].
   (Follow-up / Sample to-dos are notes, saved with their account.) */
export const TODOS_KEY = 'crumb_todos';
export const loadTodos = () => asList(readSaved(TODOS_KEY, [], { keepUnreadable: true }));
export const saveTodos = (list) => writeSaved(TODOS_KEY, list);

/* ---------- Settings and small lists (central data layer, slice 5, Nov 6 2026) ----------
   Same keys, same saved format. Some of these are saved as plain text, not JSON
   (check-in days "30", maps app "apple", this phone's notification ID). */
export const NOTIFY_KEY = 'crumb_notify_settings';     // notification settings (object)
export const STALE_DAYS_KEY = 'crumb_stale_days';      // "Due For A Check-In" days (plain text number)
export const MAPS_APP_KEY = 'crumb_maps_app';          // 'apple' | 'google' | 'waze' (plain text)
export const COMPETITORS_LIST_KEY = 'crumb_competitors'; // competitor names you added (list)
export const ORDERED_KEY = 'crumb_callsheet_ordered';  // Call Sheet "Ordered" marks { date: [customerId] }
export const GEO_CACHE_KEY = 'crumb_geo_cache';        // map coordinates already looked up (cache only)
export const PUSH_DEVICE_KEY = 'crumb_push_device';    // this phone's notification ID (never backed up)

// Plain-text values. Reading never throws; writing returns false if it couldn't save.
export function readText(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeText(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

// A saved object (always an object) / list (always a list).
export function loadObject(key) {
  const v = readSaved(key, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
export const loadArray = (key) => asList(readSaved(key, []));

// Save a preference quietly (if the phone is full, it just isn't remembered — no banner).
export const saveQuiet = (key, value) => writeText(key, JSON.stringify(value));
