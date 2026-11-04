// file: src/schedule.js
// Shared date + visit-schedule logic, used by both the Itinerary and the Calendar
// so they always agree on which prospects are due on which day.
// (No imports: other files import from here.)

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
export const CUSTOMER_COLOR = '#1e8e3e'; // customers' scheduled visits (green) // scheduled visits show as 30-minute blocks on the calendar

// Calendar blocks for prospects' scheduled visits and hand-added itinerary stops,
// for every day from startKey to endKey. These are built on the fly, never saved.
export function scheduledCalendarBlocks(prospects, visits, startKey, endKey, customers = []) {
  const blocks = [];
  for (let k = startKey; k <= endKey; k = addDaysToKey(k, 1)) {
    customers.forEach((c) => {
      if (!c.name || !c.name.trim()) return;
      if (c.showOnCalendar === false) return;
      const cTime = visitTimeOn(c, k);
      if (cTime == null) return;
      if (!isDueOn(c, k, CUSTOMER_DAYS_FIELD)) return;
      blocks.push({
        id: `visit-c-${c.id}-${k}`,
        virtual: true,
        source: 'schedule',
        title: c.name,
        date: k,
        start: cTime,
        end: Math.min(cTime + VISIT_BLOCK_MINUTES, 1440),
        color: CUSTOMER_COLOR,
        location: c.address || '',
        accountType: 'customer',
        accountId: c.id,
        accountName: c.name,
      });
    });
    prospects.forEach((p) => {
      if (!p.name || !p.name.trim()) return;
      if (p.showOnCalendar === false) return;
      const pTime = visitTimeOn(p, k);
      if (pTime == null) return; // no usual time = can't place it on the grid
      if (!isDueOn(p, k)) return;
      const st = stageInfo(p.stage);
      blocks.push({
        id: `visit-p-${p.id}-${k}`,
        virtual: true,
        source: 'schedule',
        title: p.name,
        date: k,
        start: pTime,
        end: Math.min(pTime + VISIT_BLOCK_MINUTES, 1440),
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
      color: '#8e8e93',
      location: '',
      accountType: v.accountType || null,
      accountId: v.accountId || null,
      accountName: v.name || null,
    });
  });
  return blocks;
}
