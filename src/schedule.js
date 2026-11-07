// file: src/schedule.js
// Shared date + visit-schedule logic, used by both the Itinerary and the Calendar
// so they always agree on which prospects are due on which day.
// (Only import: the saved per-day Itinerary maps from store.js.)

import { loadDayMap, LOCKS_KEY, TIMES_KEY, HIDDEN_KEY } from './store';
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', weeks: 1 },
  { key: '2w', label: 'Every 2 weeks', weeks: 2 },
  { key: '3w', label: 'Every 3 weeks', weeks: 3 },
  { key: '4w', label: 'Monthly (every 4 weeks)', weeks: 4 },
  { key: '8w', label: 'Every 2 months', weeks: 8 },
];

/* Prospect stages (saved as account.stage) */
export const STAGES = [
  { key: 'cold', label: 'Cold', color: '#0a84ff' },
  { key: 'warming', label: 'Warming up', color: '#30b0c7' },
  { key: 'warm', label: 'Warm', color: '#ff9500' },
  { key: 'hot', label: 'Hot', color: '#ff3b30' },
  { key: 'ready', label: 'Ready to close', color: '#34c759' },
];

export function stageInfo(key) {
  return STAGES.find((st) => st.key === key) || null;
}


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

/* (Reading saved data now goes through store.js — the front door.) */
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
// Which saved field holds an account's VISIT days:
//   prospects → 'deliveryDays' (how prospects have always stored them)
//   customers → 'visitDays'    (customers' deliveryDays are real delivery days)
export const PROSPECT_DAYS_FIELD = 'deliveryDays';
export const CUSTOMER_DAYS_FIELD = 'visitDays';

// Ignores snooze: "would this be a visit day by the regular schedule?"
function regularDueOn(account, dateKey, daysField = PROSPECT_DAYS_FIELD) {
  const days = account[daysField] || [];
  if (!days.includes(weekdayName(dateKey))) return false;
  const freq = FREQUENCIES.find((f) => f.key === account.visitFrequency) || FREQUENCIES[0];
  if (freq.weeks === 1 || !account.visitStart) return true;
  if (dateKey < account.visitStart) return false;
  const weeks = Math.round((mondayOf(dateKey) - mondayOf(account.visitStart)) / (7 * 24 * 3600 * 1000));
  return weeks % freq.weeks === 0;
}

// One-off moves: account.visitMoves = { 'original date': { to: 'new date', time: minutes | null } }
// The regular schedule never changes; a moved visit just leaves its day and shows up on the new one.
export function visitMoveInto(account, dateKey) {
  const moves = account.visitMoves || {};
  return Object.keys(moves).find((from) => moves[from] && moves[from].to === dateKey) || null;
}

function movedAway(account, dateKey) {
  const m = (account.visitMoves || {})[dateKey];
  return Boolean(m && m.to && m.to !== dateKey);
}

// The visit time for that date (a moved visit can have its own time).
export function visitTimeOn(account, dateKey) {
  if (account.inactive) {
    const r = account.inactive;
    return r.revisit === dateKey && typeof r.revisitTime === 'number' ? r.revisitTime : null;
  }
  const from = visitMoveInto(account, dateKey);
  const moved = from ? account.visitMoves[from] : null;
  if (moved && typeof moved.time === 'number') return moved.time;
  return typeof account.visitTime === 'number' ? account.visitTime : null;
}

// Moves to keep when saving: drops ones where both dates are more than 60 days ago.
export function pruneMoves(moves) {
  const cutoff = addDaysToKey(todayKeyLocal(), -60);
  const out = {};
  Object.keys(moves || {}).forEach((from) => {
    const m = moves[from];
    if (m && m.to && (from >= cutoff || m.to >= cutoff)) out[from] = m;
  });
  return out;
}

// Due on this date, and not snoozed (snoozeUntil = first date visits come back).
// A visit moved INTO this date always counts; one moved AWAY never does.
export function isDueOn(account, dateKey, daysField = PROSPECT_DAYS_FIELD) {
  // Closed / dead accounts drop off the Itinerary, Calendar and reminders, except on their revisit day.
  if (account.inactive) return Boolean(account.inactive.revisit && account.inactive.revisit === dateKey);
  if (visitMoveInto(account, dateKey)) return true;
  if (movedAway(account, dateKey)) return false;
  if (account.snoozeUntil && dateKey < account.snoozeUntil) return false;
  return regularDueOn(account, dateKey, daysField);
}

export function todayKeyLocal() {
  return keyOf(new Date());
}

// Next regular visit date on or after fromKey (looks ahead up to a year), or null.
export function nextVisitDate(account, fromKey, ignoreSnooze = false, daysField = PROSPECT_DAYS_FIELD) {
  for (let i = 0, k = fromKey; i < 370; i++, k = addDaysToKey(k, 1)) {
    if (ignoreSnooze ? regularDueOn(account, k, daysField) : isDueOn(account, k, daysField)) return k;
  }
  return null;
}

export function isSnoozed(account) {
  return Boolean(account.snoozeUntil && account.snoozeUntil > todayKeyLocal());
}

// What snoozeUntil to save for a choice: 'skip' = skip the next visit, or a number of weeks.
export function snoozeUntilFor(account, choice, daysField = PROSPECT_DAYS_FIELD) {
  const today = todayKeyLocal();
  if (choice === 'skip') {
    // start counting from the later of today and any current snooze
    const from = account.snoozeUntil && account.snoozeUntil > today ? account.snoozeUntil : today;
    const next = nextVisitDate(account, from, true, daysField);
    return next ? addDaysToKey(next, 1) : null;
  }
  return addDaysToKey(today, 7 * choice);
}

// Itinerary: due that day and "Show in itinerary" isn't switched off.
export function onItinerary(account, dateKey, daysField = PROSPECT_DAYS_FIELD) {
  return account.showInItinerary !== false && isDueOn(account, dateKey, daysField);
}

export const VISIT_BLOCK_MINUTES = 30;
export const PROSPECT_COLOR = '#0077cc'; // prospects (blue)
export const MEETING_COLOR = '#d96b00';  // meetings (orange, same as the Meeting note label)
export const CUSTOMER_COLOR = '#1e8e3e'; // customers' scheduled visits (green) // scheduled visits show as 30-minute blocks on the calendar

// Calendar blocks for prospects' scheduled visits and hand-added itinerary stops,
// for every day from startKey to endKey. These are built on the fly, never saved.
// Calendar events and hand-added stops linked to an account that's been made Inactive drop off the
// Itinerary, Calendar and reminders from the day it went inactive on (except its revisit day).
// Nothing is deleted: make the account active again and they come back. Earlier days stay as history.
export function hiddenByInactive(item, customers = [], prospects = []) {
  if (!item || item.accountId == null || !item.date) return false;
  const isCustomer = item.accountType === 'customer' || item.type === 'contact';
  const list = isCustomer ? customers : prospects;
  const acct = (list || []).find((a) => a && String(a.id) === String(item.accountId));
  if (!acct || !acct.inactive) return false;
  if (acct.inactive.revisit && acct.inactive.revisit === item.date) return false;
  const since = /^\d{4}-\d{2}-\d{2}$/.test(acct.inactive.since || '') ? acct.inactive.since : '0000-00-00';
  return item.date >= since;
}

// A scheduled visit's time on one day: a time locked for that day, else a time moved on the Itinerary
// that day (drag, Optimize, longer visit), else the usual time.
export function dayTimeOf(key, day, usual) {
  const locks = loadDayMap(LOCKS_KEY)[day] || {};
  if (typeof locks[key] === 'number') return locks[key];
  const times = loadDayMap(TIMES_KEY)[day] || {};
  if (typeof times[key] === 'number') return times[key];
  return usual;
}

export function scheduledCalendarBlocks(prospects, visits, startKey, endKey, customers = []) {
  const blocks = [];
  const hidden = loadDayMap(HIDDEN_KEY); // taken off the Calendar for one day
  for (let k = startKey; k <= endKey; k = addDaysToKey(k, 1)) {
    const gone = hidden[k] || [];
    customers.forEach((c) => {
      if (!c.name || !c.name.trim()) return;
      if (c.showOnCalendar === false) return;
      const cTime = dayTimeOf(`c-${c.id}`, k, visitTimeOn(c, k));
      if (cTime == null) return;
      if (!isDueOn(c, k, CUSTOMER_DAYS_FIELD)) return;
      if (gone.includes(`c-${c.id}`)) return;
      blocks.push({
        id: `visit-c-${c.id}-${k}`,
        virtual: true,
        source: 'schedule',
        title: c.inactive ? `Revisit: ${c.name}` : c.name,
        date: k,
        start: cTime,
        end: Math.min(cTime + VISIT_BLOCK_MINUTES, 1440),
        color: CUSTOMER_COLOR,
        location: c.address || '',
        accountType: 'customer',
        accountId: c.id,
        accountName: c.name,
        stopKey: `c-${c.id}`,
      });
    });
    prospects.forEach((p) => {
      if (!p.name || !p.name.trim()) return;
      if (p.showOnCalendar === false) return;
      const pTime = dayTimeOf(`p-${p.id}`, k, visitTimeOn(p, k));
      if (pTime == null) return; // no usual time = can't place it on the grid
      if (!isDueOn(p, k)) return;
      if (gone.includes(`p-${p.id}`)) return;
      const st = stageInfo(p.stage);
      blocks.push({
        id: `visit-p-${p.id}-${k}`,
        virtual: true,
        source: 'schedule',
        title: p.inactive ? `Revisit: ${p.name}` : p.name,
        date: k,
        start: pTime,
        end: Math.min(pTime + VISIT_BLOCK_MINUTES, 1440),
        color: PROSPECT_COLOR,
        location: p.address || '',
        accountType: 'prospect',
        accountId: p.id,
        accountName: p.name,
        stopKey: `p-${p.id}`,
      });
    });
  }
  (visits || []).forEach((v, i) => {
    const start = hhmmToMinutes(v.time);
    if (!v.date || v.date < startKey || v.date > endKey || start == null) return;
    if ((hidden[v.date] || []).includes(`m-${v.id || i}`)) return;
    if (hiddenByInactive(v, customers, prospects)) return;
    // Same account already has its scheduled visit that day → show it once.
    if (v.accountId) {
      const kind = v.accountType === 'customer' || v.type === 'contact' ? 'c' : 'p';
      if (blocks.some((bl) => bl.id === `visit-${kind}-${v.accountId}-${v.date}`)) return;
    }
    blocks.push({
      id: `visit-m-${v.id || i}-${v.date}`,
      virtual: true,
      source: 'itinerary',
      title: v.name || 'Stop',
      date: v.date,
      start,
      end: Math.min(start + VISIT_BLOCK_MINUTES, 1440),
      color: v.accountType === 'customer' || v.type === 'contact' ? CUSTOMER_COLOR : PROSPECT_COLOR,
      location: '',
      accountType: v.accountType || null,
      accountId: v.accountId || null,
      accountName: v.name || null,
      stopKey: `m-${v.id || i}`,
    });
  });
  return blocks;
}
