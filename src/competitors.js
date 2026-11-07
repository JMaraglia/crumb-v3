// file: src/competitors.js
// Competitors an account buys from (saved on the account as `competitors: ['Sysco', …]`).
// The pick list = these starters + every name you've typed before (crumb_competitors) + any name
// already on an account, so new ones show up next time you type.
export const COMPETITORS_KEY = 'crumb_competitors';

import { loadCustomers, loadProspects } from './store';

export const STARTER_COMPETITORS = [
  'Sysco',
  'US Foods',
  'Gordon Food Service',
  'Thomsen Foodservice',
  'Costas Provisions',
  'Prime Source Foods',
  'Quality Beef Company',
  'Baldor',
  "Chefs' Warehouse",
  'Arrow Paper',
  'BradyPLUS',
  'W.B. Mason',
  'Restaurant Depot',
];

const read = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const norm = (s) => String(s || '').trim().toLowerCase();

// Every known name, no repeats (first spelling wins), A–Z.
export function allCompetitors() {
  const names = [...STARTER_COMPETITORS, ...read(COMPETITORS_KEY)];
  [...loadCustomers(), ...loadProspects()].forEach((a) => {
    if (a && Array.isArray(a.competitors)) names.push(...a.competitors);
  });
  const seen = new Map();
  names.forEach((n) => {
    const t = String(n || '').trim();
    if (t && !seen.has(norm(t))) seen.set(norm(t), t);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// Remember a new name for the pick list.
export function rememberCompetitor(name) {
  const t = String(name || '').trim();
  if (!t) return;
  if (allCompetitors().some((n) => norm(n) === norm(t))) return;
  try {
    localStorage.setItem(COMPETITORS_KEY, JSON.stringify([...read(COMPETITORS_KEY), t]));
  } catch {
    /* not critical */
  }
}

// If the typed name matches a known one (any capitalization), use the known spelling.
export function knownSpelling(name) {
  const t = String(name || '').trim();
  return allCompetitors().find((n) => norm(n) === norm(t)) || t;
}
