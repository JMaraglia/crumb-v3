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
