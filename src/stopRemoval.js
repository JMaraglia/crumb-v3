// file: src/stopRemoval.js
// Taking a visit / stop / event off the Calendar, the Itinerary, or both.
//   crumb_itinerary_removed { date: [key] }  → off that day's Itinerary only
//   crumb_calendar_hidden   { date: [key] }  → off the Calendar that day only
// Keys match the Itinerary's: c-<customer id>, p-<prospect id>, m-<stop id>, e-<event id>.
// "Both" really deletes hand-added stops and calendar events; scheduled visits just skip that day
// (the regular schedule never changes).
import { addDaysToKey, todayKeyLocal } from './schedule';
import { loadEvents, saveEvents, loadStops, saveStops, loadDayMap, saveDayMap, snapshotSaved, restoreSaved, EVENTS_KEY, STOPS_KEY, REMOVED_KEY, HIDDEN_KEY } from './store';

export { REMOVED_KEY, HIDDEN_KEY }; // (other screens import them from here)


export function removedOn(storageKey, date) {
  const m = loadDayMap(storageKey);
  return Array.isArray(m[date]) ? m[date] : [];
}

function addTo(storageKey, date, key) {
  const m = loadDayMap(storageKey);
  const list = Array.isArray(m[date]) ? m[date] : [];
  if (!list.includes(key)) m[date] = [...list, key];
  const cutoff = addDaysToKey(todayKeyLocal(), -60); // forget old days
  Object.keys(m).forEach((k) => k < cutoff && delete m[k]);
  saveDayMap(storageKey, m);
}

// where: 'calendar' | 'itinerary' | 'both'
export function removeStop(where, key, date) {
  if (where === 'both') {
    if (key.startsWith('e-')) {
      saveEvents(loadEvents().filter((ev) => `e-${ev.id}` !== key));
      return;
    }
    if (key.startsWith('m-')) {
      saveStops(loadStops().filter((v, i) => `m-${v.id || i}` !== key));
      return;
    }
    addTo(REMOVED_KEY, date, key);
    addTo(HIDDEN_KEY, date, key);
    return;
  }
  addTo(where === 'calendar' ? HIDDEN_KEY : REMOVED_KEY, date, key);
}

// For Undo: copy of everything a removal can touch, and putting it back.
const TOUCHED = [EVENTS_KEY, STOPS_KEY, REMOVED_KEY, HIDDEN_KEY];
export function snapshotStops() {
  return snapshotSaved(TOUCHED);
}
export function restoreStops(snap) {
  restoreSaved(snap);
}
