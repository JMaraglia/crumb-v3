// file: src/schedule.js
// Shared date + visit-schedule logic, used by both the Itinerary and the Calendar
// so they always agree on which prospects are due on which day.
import { DAYS, FREQUENCIES, stageInfo } from './AccountViews';

/* ---------- dates as 'YYYY-MM-DD' keys (local time) ---------- */
export function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDaysToKey(k, n) {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}
function weekdayName(k) {
  return DAYS[(fromKey(k).getDay() + 6) % 7]; // Mon=0 … Sun=6
}
function mondayOf(k) {
  const d = fromKey(k);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/* ---------- reading saved data safely ---------- */
export function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
// Saved visits should be a list. If they were stored as an object
// (e.g. {} or grouped by date), turn them into a list instead of crashing.
export function toVisitList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.values(value).flat().filter((v) => v && typeof v === 'object');
  }
  return [];
}
// "HH:MM" (hand-added itinerary stops) ↔ minutes from midnight
export function hhmmToMinutes(t) {
  if (!t || typeof t !== 'string' || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function minutesToHhmm(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/* ---------- visit schedules ---------- */
// Is this account due for a visit on this date (by its days + how often)?
export function isDueOn(account, dateKey) {
  const days = account.deliveryDays || [];
  if (!days.includes(weekdayName(dateKey))) return false;
  const freq = FREQUENCIES.find((f) => f.key === account.visitFrequency) || FREQUENCIES[0];
  if (freq.weeks === 1 || !account.visitStart) return true;
  if (dateKey < account.visitStart) return false;
  const weeks = Math.round((mondayOf(dateKey) - mondayOf(account.visitStart)) / (7 * 24 * 3600 * 1000));
  return weeks % freq.weeks === 0;
}

// Itinerary: due that day and "Show in itinerary" isn't switched off.
export function onItinerary(account, dateKey) {
  return account.showInItinerary !== false && isDueOn(account, dateKey);
}

export const VISIT_BLOCK_MINUTES = 30; // scheduled visits show as 30-minute blocks on the calendar

// Calendar blocks for prospects' scheduled visits and hand-added itinerary stops,
// for every day from startKey to endKey. These are built on the fly, never saved.
export function scheduledCalendarBlocks(prospects, visits, startKey, endKey) {
  const blocks = [];
  for (let k = startKey; k <= endKey; k = addDaysToKey(k, 1)) {
    prospects.forEach((p) => {
      if (!p.name || !p.name.trim()) return;
      if (p.showOnCalendar === false) return;
      if (typeof p.visitTime !== 'number') return; // no usual time = can't place it on the grid
      if (!isDueOn(p, k)) return;
      const st = stageInfo(p.stage);
      blocks.push({
        id: `visit-p-${p.id}-${k}`,
        virtual: true,
        source: 'schedule',
        title: p.name,
        date: k,
        start: p.visitTime,
        end: Math.min(p.visitTime + VISIT_BLOCK_MINUTES, 1440),
        color: st ? st.color : '#0077cc',
        location: p.address || '',
        accountType: 'prospect',
        accountId: p.id,
        accountName: p.name,
      });
    });
  }
  (visits || []).forEach((v, i) => {
    const start = hhmmToMinutes(v.time);
    if (!v.date || v.date < startKey || v.date > endKey || start == null) return;
    blocks.push({
      id: `visit-m-${v.id || i}-${v.date}`,
      virtual: true,
      source: 'itinerary',
      title: v.name || 'Stop',
      date: v.date,
      start,
      end: Math.min(start + VISIT_BLOCK_MINUTES, 1440),
      color: '#8e8e93',
      location: '',
      accountType: v.accountType || null,
      accountId: v.accountId || null,
      accountName: v.name || null,
    });
  });
  return blocks;
}
