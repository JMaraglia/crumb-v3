// file: src/stopRemoval.js
// Taking a visit / stop / event off the Calendar, the Itinerary, or both.
//   crumb_itinerary_removed { date: [key] }  → off that day's Itinerary only
//   crumb_calendar_hidden   { date: [key] }  → off the Calendar that day only
// Keys match the Itinerary's: c-<customer id>, p-<prospect id>, m-<stop id>, e-<event id>.
// "Both" really deletes hand-added stops and calendar events; scheduled visits just skip that day
// (the regular schedule never changes).
import { readJSON, toVisitList, addDaysToKey, todayKeyLocal } from './schedule';

export const REMOVED_KEY = 'crumb_itinerary_removed';
export const HIDDEN_KEY = 'crumb_calendar_hidden';
const EVENTS_KEY = 'crumb_calendar_events';
const VISITS_KEY = 'visitData';

export function removedOn(storageKey, date) {
  const m = readJSON(storageKey, {}) || {};
  return Array.isArray(m[date]) ? m[date] : [];
}

function addTo(storageKey, date, key) {
  const m = readJSON(storageKey, {}) || {};
  const list = Array.isArray(m[date]) ? m[date] : [];
  if (!list.includes(key)) m[date] = [...list, key];
  const cutoff = addDaysToKey(todayKeyLocal(), -60); // forget old days
  Object.keys(m).forEach((k) => k < cutoff && delete m[k]);
  localStorage.setItem(storageKey, JSON.stringify(m));
}

// where: 'calendar' | 'itinerary' | 'both'
export function removeStop(where, key, date) {
  if (where === 'both') {
    if (key.startsWith('e-')) {
      const events = readJSON(EVENTS_KEY, []);
      if (Array.isArray(events)) localStorage.setItem(EVENTS_KEY, JSON.stringify(events.filter((ev) => `e-${ev.id}` !== key)));
      return;
    }
    if (key.startsWith('m-')) {
      const visits = toVisitList(readJSON(VISITS_KEY, []));
      localStorage.setItem(VISITS_KEY, JSON.stringify(visits.filter((v, i) => `m-${v.id || i}` !== key)));
      return;
    }
    addTo(REMOVED_KEY, date, key);
    addTo(HIDDEN_KEY, date, key);
    return;
  }
  addTo(where === 'calendar' ? HIDDEN_KEY : REMOVED_KEY, date, key);
}

// For Undo: copy of everything a removal can touch, and putting it back.
const TOUCHED = [EVENTS_KEY, VISITS_KEY, REMOVED_KEY, HIDDEN_KEY];
export function snapshotStops() {
  const snap = {};
  TOUCHED.forEach((k) => (snap[k] = localStorage.getItem(k)));
  return snap;
}
export function restoreStops(snap) {
  TOUCHED.forEach((k) => (snap[k] == null ? localStorage.removeItem(k) : localStorage.setItem(k, snap[k])));
}
