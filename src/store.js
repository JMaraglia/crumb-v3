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
