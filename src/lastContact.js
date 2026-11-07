// file: src/lastContact.js
// "Haven't seen in a while": when did you last have contact with an account?
// Last contact = the newest of: a note on it (not Background), an Itinerary check-off of it,
// or a calendar event linked to it (on or before today).
// Accounts with no contact at all count from the day they were added (ids are creation times).
import { keyOf, todayKeyLocal } from './schedule';
import { loadEvents, loadStops, loadDayMap, DONE_KEY } from './store';

export const STALE_KEY = 'crumb_stale_days';
export const STALE_CHOICES = [0, 21, 30, 45, 60, 90]; // 0 = off
export function staleDays() {
  const raw = localStorage.getItem(STALE_KEY);
  if (raw == null || raw === '') return 30; // default: 30 days
  const v = Number(raw);
  return STALE_CHOICES.includes(v) ? v : 30;
}

const dayOf = (ts) => {
  const t = Date.parse(ts);
  return t ? keyOf(new Date(t)) : null;
};

// One pass over the itinerary check-offs and calendar: { 'c-12': 'YYYY-MM-DD', 'p-7': … }
function contactIndex() {
  const idx = {};
  const bump = (k, d) => {
    if (d && (!idx[k] || d > idx[k])) idx[k] = d;
  };
  const done = loadDayMap(DONE_KEY);
  Object.keys(done).forEach((d) => (Array.isArray(done[d]) ? done[d] : []).forEach((k) => bump(k, d)));
  loadStops().forEach((v) => {
    if (v && v.done && v.accountId) bump(`${v.accountType === 'customer' || v.type === 'contact' ? 'c' : 'p'}-${v.accountId}`, v.date);
  });
  const today = todayKeyLocal();
  loadEvents().forEach((ev) => {
    if (ev && ev.accountId && ev.date && ev.date <= today) bump(`${ev.accountType === 'customer' ? 'c' : 'p'}-${ev.accountId}`, ev.date);
  });
  return idx;
}

// { date: 'YYYY-MM-DD' | null, days: number | null, never: bool }
export function lastContact(account, type, idx = contactIndex()) {
  let best = idx[`${type === 'customer' ? 'c' : 'p'}-${account.id}`] || null;
  (account.notes || []).forEach((n) => {
    if (!n || n.category === 'Background') return;
    const d = dayOf(n.timestamp);
    if (d && (!best || d > best)) best = d;
  });
  const today = todayKeyLocal();
  const diff = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
  if (best) return { date: best, days: diff(best), never: false };
  const created = Number(account.id) > 1e12 ? keyOf(new Date(Number(account.id))) : null;
  return { date: null, days: created ? diff(created) : null, never: true };
}

// Customers + prospects not contacted in `limit` days (oldest first). Skips Inactive and snoozed ones.
export function staleAccounts(customers, prospects, limit = staleDays()) {
  if (!limit) return [];
  const idx = contactIndex();
  const today = todayKeyLocal();
  const out = [];
  const take = (list, type) =>
    (list || []).forEach((a) => {
      if (!a || !a.name || !String(a.name).trim() || a.inactive) return;
      if (a.snoozeUntil && a.snoozeUntil > today) return;
      const lc = lastContact(a, type, idx);
      if (lc.days != null && lc.days >= limit) out.push({ type, account: a, ...lc });
    });
  take(customers, 'customer');
  take(prospects, 'prospect');
  return out.sort((x, y) => y.days - x.days);
}

export { contactIndex };
