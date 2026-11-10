// file: src/syncPull.js
// Sync step S4 (Nov 7 2026): what the cloud sends back down (pull_changes) → Crumb's saved data.
//
//   planPull(cloud, readText, pendingKeys) → { writes: { key: newText }, changed, skipped, blocked }
//     cloud        the answer from pull_changes: { accounts: [...], notes: [...], events, stops, todos, day_marks, settings }
//     readText     (key) → saved text right now
//     pendingKeys  Set of "table|id" for changes still waiting to be sent from THIS device. Those records
//                  are left alone (this device's newer edit goes up first; the cloud's merged result
//                  comes back on a later pull).
//
// Pure logic: reads through readText, writes nothing itself. The caller saves `writes`.
//
// Safety brake: if this pull would remove more than 10% of a list AND more than 3 items, nothing is
// applied and `blocked` says why. (A bug or a mix-up can never empty a phone.)
import { DAY_MAP_KEYS, SETTING_KEYS } from './syncDiff';

const parse = (text, fallback) => {
  if (text == null || text === '') return fallback;
  try {
    const v = JSON.parse(text);
    return v == null ? fallback : v;
  } catch {
    return undefined;
  }
};
const listOf = (v) => {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object');
  if (v && typeof v === 'object') return Object.values(v).flat().filter((x) => x && typeof x === 'object');
  return [];
};
// The cloud keeps fields in its own order, so compare with the order ignored.
const sorted = (v) => {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  return v;
};
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
// Keep this device's own copy when the cloud's is the same (so nothing is rewritten for nothing).
const keepIfSame = (old, next) => (old !== undefined && same(old, next) ? old : next);
const idOf = (x) => (x && x.id != null ? String(x.id) : '');
const rows = (cloud, t) => (cloud && Array.isArray(cloud[t]) ? cloud[t] : []);

const KIND_KEY = { customer: 'crumb_contacts', prospect: 'crumb_prospects' };
const DAY_MAP_KEY_OF = Object.fromEntries(Object.entries(DAY_MAP_KEYS).map(([k, kind]) => [kind, k]));
const SETTING_KEY_OF = Object.fromEntries(Object.entries(SETTING_KEYS).map(([k, name]) => [name, k]));
const DEVICE_ONLY_SETTING_FIELDS = { notify: ['enabled'] };

const BRAKE_SHARE = 0.1;
const BRAKE_MIN = 3;

export function planPull(cloud, readText, pendingKeys = new Set()) {
  const pending = (table, id) => pendingKeys.has(`${table}|${id}`);
  const out = { writes: {}, changed: 0, skipped: 0, blocked: null };
  const removedCount = {}; // list name → how many this pull removes
  const sizeOf = {};

  // ---------- accounts + notes (customers and prospects, notes inside them)
  const lists = {};
  ['crumb_contacts', 'crumb_prospects'].forEach((k) => {
    const v = parse(readText(k), []);
    lists[k] = v === undefined ? null : listOf(v).map((a) => ({ ...a }));
  });
  const accountsTouched = rows(cloud, 'accounts').length || rows(cloud, 'notes').length;
  if (accountsTouched && (lists.crumb_contacts === null || lists.crumb_prospects === null)) {
    out.blocked = 'Some saved customers or prospects couldn’t be read, so nothing was changed.';
    return out;
  }
  if (accountsTouched) {
    const before = {
      crumb_contacts: JSON.stringify(lists.crumb_contacts),
      crumb_prospects: JSON.stringify(lists.crumb_prospects),
    };
    const startAccounts = lists.crumb_contacts.length + lists.crumb_prospects.length;
    const startNotes = [...lists.crumb_contacts, ...lists.crumb_prospects].reduce((n, a) => n + (Array.isArray(a.notes) ? a.notes.length : 0), 0);
    sizeOf.accounts = startAccounts;
    sizeOf.notes = startNotes;
    removedCount.accounts = 0;
    removedCount.notes = 0;

    const find = (id) => {
      for (const k of ['crumb_contacts', 'crumb_prospects']) {
        const i = lists[k].findIndex((a) => idOf(a) === id);
        if (i >= 0) return { k, i };
      }
      return null;
    };

    rows(cloud, 'accounts').forEach((r) => {
      const id = String(r.id);
      if (pending('accounts', id)) {
        out.skipped += 1;
        return;
      }
      const at = find(id);
      if (r.deleted) {
        if (at) {
          removedCount.accounts += 1;
          removedCount.notes += (lists[at.k][at.i].notes || []).length;
          lists[at.k].splice(at.i, 1);
        }
        return;
      }
      const targetKey = KIND_KEY[r.kind];
      if (!targetKey) return;
      const fields = { ...(r.data || {}) };
      delete fields.notes;
      if (fields.id == null) fields.id = id;
      if (at) {
        const old = lists[at.k][at.i];
        const oldFields = { ...old };
        delete oldFields.notes;
        const next = same(oldFields, fields) ? old : { ...fields, notes: Array.isArray(old.notes) ? old.notes : [] };
        if (at.k === targetKey) lists[at.k][at.i] = next;
        else {
          // the other device converted it (prospect → customer): it moves, notes and all
          lists[at.k].splice(at.i, 1);
          lists[targetKey].push(next);
        }
      } else {
        lists[targetKey].push({ ...fields, notes: [] });
      }
    });

    const findNote = (nid) => {
      for (const k of ['crumb_contacts', 'crumb_prospects']) {
        for (let i = 0; i < lists[k].length; i++) {
          const notes = lists[k][i].notes;
          if (!Array.isArray(notes)) continue;
          const j = notes.findIndex((n) => idOf(n) === nid);
          if (j >= 0) return { k, i, j };
        }
      }
      return null;
    };
    // notes in time order, so new ones land in the order they were written
    const noteRows = [...rows(cloud, 'notes')].sort((a, b) =>
      String((a.data && a.data.timestamp) || '').localeCompare(String((b.data && b.data.timestamp) || ''))
    );
    noteRows.forEach((r) => {
      const nid = String(r.id);
      if (pending('notes', nid)) {
        out.skipped += 1;
        return;
      }
      const at = findNote(nid);
      if (r.deleted) {
        if (at) {
          const acct = lists[at.k][at.i];
          acct.notes = acct.notes.filter((_, j) => j !== at.j);
          removedCount.notes += 1;
        }
        return;
      }
      const note = { ...(r.data || {}) };
      if (note.id == null) note.id = nid;
      const owner = find(String(r.account_id));
      if (!owner) {
        out.skipped += 1; // its account isn't on this device (yet)
        return;
      }
      if (at && at.k === owner.k && at.i === owner.i) {
        const acct = lists[at.k][at.i];
        acct.notes = acct.notes.map((n, j) => (j === at.j ? keepIfSame(n, note) : n));
        return;
      }
      if (at) {
        const from = lists[at.k][at.i];
        from.notes = from.notes.filter((_, j) => j !== at.j);
      }
      const acct = lists[owner.k][owner.i];
      acct.notes = [...(Array.isArray(acct.notes) ? acct.notes : []), note];
    });

    ['crumb_contacts', 'crumb_prospects'].forEach((k) => {
      const text = JSON.stringify(lists[k]);
      if (text !== before[k]) {
        out.writes[k] = text;
        out.changed += 1;
      }
    });
  }

  // ---------- events, stops, to-dos: one item per record
  const recordLists = [
    ['events', 'crumb_calendar_events', 'calendar events'],
    ['stops', 'visitData', 'daily stops'],
    ['todos', 'crumb_todos', 'to-dos'],
  ];
  recordLists.forEach(([table, key, label]) => {
    const rs = rows(cloud, table);
    if (!rs.length) return;
    const v = parse(readText(key), []);
    if (v === undefined) {
      out.blocked = `Saved ${label} couldn’t be read, so nothing was changed.`;
      return;
    }
    const list = listOf(v);
    const startText = JSON.stringify(list);
    sizeOf[label] = list.length;
    removedCount[label] = 0;
    let next = [...list];
    rs.forEach((r) => {
      const id = String(r.id);
      if (pending(table, id)) {
        out.skipped += 1;
        return;
      }
      const i = next.findIndex((x) => idOf(x) === id);
      if (r.deleted) {
        if (i >= 0) {
          next = next.filter((_, j) => j !== i);
          removedCount[label] += 1;
        }
        return;
      }
      const rec = { ...(r.data || {}) };
      if (rec.id == null) rec.id = id;
      if (i >= 0) next[i] = keepIfSame(next[i], rec);
      else next.push(rec);
    });
    const text = JSON.stringify(next);
    if (text !== startText) {
      out.writes[key] = text;
      out.changed += 1;
    }
  });
  if (out.blocked) return { ...out, writes: {}, changed: 0 };

  // ---------- per-day marks
  const maps = {};
  rows(cloud, 'day_marks').forEach((r) => {
    const [kind, day] = String(r.id).split('|');
    const key = DAY_MAP_KEY_OF[kind];
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return;
    if (pending('day_marks', r.id)) {
      out.skipped += 1;
      return;
    }
    if (!(key in maps)) {
      const v = parse(readText(key), {});
      maps[key] = v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {};
    }
    if (r.deleted) delete maps[key][day];
    else maps[key][day] = keepIfSame(maps[key][day], r.data);
  });
  Object.entries(maps).forEach(([key, m]) => {
    const old = parse(readText(key), {});
    if (!same(old, m)) {
      out.writes[key] = JSON.stringify(m);
      out.changed += 1;
    }
  });

  // ---------- settings
  rows(cloud, 'settings').forEach((r) => {
    const name = String(r.id);
    const key = SETTING_KEY_OF[name];
    if (!key || r.deleted) return;
    if (pending('settings', name)) {
      out.skipped += 1;
      return;
    }
    let text;
    if (key === 'crumb_stale_days') {
      if (r.data == null || Number.isNaN(Number(r.data))) return;
      text = String(Number(r.data));
    } else {
      let value = r.data;
      const keep = DEVICE_ONLY_SETTING_FIELDS[name];
      if (keep && value && typeof value === 'object') {
        // "on for this device" stays this device's own
        const mine = parse(readText(key), {}) || {};
        value = { ...value };
        keep.forEach((f) => {
          if (mine && typeof mine === 'object' && f in mine) value[f] = mine[f];
          else delete value[f];
        });
      }
      const mineNow = parse(readText(key), null);
      if (mineNow !== undefined && same(mineNow, value)) return;
      text = JSON.stringify(value);
    }
    if (text !== readText(key)) {
      out.writes[key] = text;
      out.changed += 1;
    }
  });

  // ---------- safety brake
  for (const [label, n] of Object.entries(removedCount)) {
    const size = sizeOf[label] || 0;
    if (n > BRAKE_MIN && n > size * BRAKE_SHARE) {
      return {
        writes: {},
        changed: 0,
        skipped: out.skipped,
        blocked: `Safety brake: this update would have removed ${n} of ${size} ${label}, so nothing was changed.`,
      };
    }
  }
  return out;
}

// Keys a pull may write (used to refresh screens afterwards).
export const PULL_KEYS = ['crumb_contacts', 'crumb_prospects', 'crumb_calendar_events', 'visitData', 'crumb_todos',
  ...Object.keys(DAY_MAP_KEYS), ...Object.keys(SETTING_KEYS)];
