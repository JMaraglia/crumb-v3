import { describe, it, expect } from 'vitest';
import { planPull } from '../src/syncPull';

const reader = (saved) => (k) => (k in saved ? saved[k] : null);
const acct = (id, kind, data) => ({ id: String(id), kind, data: { id, ...data }, version: 1, deleted: false });

describe('planPull (S4: bringing changes down)', () => {
  it('adds a new note from another device to the right account', () => {
    const saved = { crumb_prospects: JSON.stringify([{ id: 11, name: 'Home Cafe', notes: [] }]) };
    const plan = planPull({ notes: [{ id: 'n-1', account_id: '11', data: { id: 'n-1', text: 'Hi' }, deleted: false }] }, reader(saved));
    expect(plan.blocked).toBe(null);
    expect(JSON.parse(plan.writes.crumb_prospects)[0].notes).toEqual([{ id: 'n-1', text: 'Hi' }]);
  });

  it('changes nothing when the cloud matches this device', () => {
    const list = [{ id: 11, name: 'Home Cafe', notes: [{ id: 'n-1', text: 'Hi' }] }];
    const saved = { crumb_prospects: JSON.stringify(list) };
    const plan = planPull(
      { accounts: [acct(11, 'prospect', { name: 'Home Cafe' })], notes: [{ id: 'n-1', account_id: '11', data: { id: 'n-1', text: 'Hi' } }] },
      reader(saved)
    );
    expect(plan.writes).toEqual({});
    expect(plan.changed).toBe(0);
  });

  it('updates account fields but keeps its notes, and keeps number IDs as numbers', () => {
    const saved = { crumb_contacts: JSON.stringify([{ id: 3, name: 'Old', notes: [{ id: 'n-9', text: 'x' }] }]) };
    const plan = planPull({ accounts: [acct(3, 'customer', { name: 'New' })] }, reader(saved));
    const c = JSON.parse(plan.writes.crumb_contacts)[0];
    expect(c).toEqual({ id: 3, name: 'New', notes: [{ id: 'n-9', text: 'x' }] });
  });

  it('moves a prospect the other device converted into customers, notes and all', () => {
    const saved = {
      crumb_contacts: '[]',
      crumb_prospects: JSON.stringify([{ id: 11, name: 'Home Cafe', notes: [{ id: 'n-1', text: 'Hi' }] }]),
    };
    const plan = planPull({ accounts: [acct(11, 'customer', { name: 'Home Cafe' })] }, reader(saved));
    expect(JSON.parse(plan.writes.crumb_prospects)).toEqual([]);
    expect(JSON.parse(plan.writes.crumb_contacts)[0].notes).toEqual([{ id: 'n-1', text: 'Hi' }]);
  });

  it('leaves alone a record this device changed and has not sent yet', () => {
    const saved = { crumb_calendar_events: JSON.stringify([{ id: 902, title: 'Mine' }]) };
    const plan = planPull({ events: [{ id: '902', data: { id: 902, title: 'Theirs' } }] }, reader(saved), new Set(['events|902']));
    expect(plan.writes).toEqual({});
    expect(plan.skipped).toBe(1);
  });

  it('adds, changes and removes calendar events', () => {
    const saved = { crumb_calendar_events: JSON.stringify([{ id: 1, title: 'A' }, { id: 2, title: 'B' }]) };
    const plan = planPull(
      { events: [{ id: '1', data: { id: 1, title: 'A2' } }, { id: '2', data: { id: 2 }, deleted: true }, { id: '3', data: { id: 3, title: 'C' } }] },
      reader(saved)
    );
    expect(JSON.parse(plan.writes.crumb_calendar_events)).toEqual([{ id: 1, title: 'A2' }, { id: 3, title: 'C' }]);
  });

  it('safety brake: refuses a pull that would remove most of a list, and changes nothing', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: `E${i}` }));
    const saved = { crumb_calendar_events: JSON.stringify(events) };
    const gone = events.slice(0, 5).map((e) => ({ id: String(e.id), data: e, deleted: true }));
    const plan = planPull({ events: gone, todos: [{ id: 't1', data: { id: 't1', text: 'x' } }] }, reader(saved));
    expect(plan.blocked).toMatch(/Safety brake/);
    expect(plan.writes).toEqual({});
  });

  it('safety brake: allows a small, normal delete', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    const saved = { crumb_calendar_events: JSON.stringify(events) };
    const plan = planPull({ events: [{ id: '1', data: {}, deleted: true }] }, reader(saved));
    expect(plan.blocked).toBe(null);
    expect(JSON.parse(plan.writes.crumb_calendar_events)).toHaveLength(4);
  });

  it('day marks and settings come down; "notifications on for this device" stays this device’s own', () => {
    const saved = { crumb_itinerary_done: JSON.stringify({ '2026-11-06': ['x'] }), crumb_notify_settings: JSON.stringify({ enabled: false, time: '7:00' }) };
    const plan = planPull(
      {
        day_marks: [{ id: 'done|2026-11-07', data: ['s-1'] }],
        settings: [{ id: 'notify', data: { enabled: true, time: '8:00' } }, { id: 'staleDays', data: 21 }, { id: 'cloud_test', data: {} }],
      },
      reader(saved)
    );
    expect(JSON.parse(plan.writes.crumb_itinerary_done)).toEqual({ '2026-11-06': ['x'], '2026-11-07': ['s-1'] });
    expect(JSON.parse(plan.writes.crumb_notify_settings)).toEqual({ enabled: false, time: '8:00' });
    expect(plan.writes.crumb_stale_days).toBe('21');
    expect(Object.keys(plan.writes)).toHaveLength(3);
  });

  it('refuses to touch unreadable saved data', () => {
    const plan = planPull({ accounts: [acct(1, 'customer', { name: 'X' })] }, reader({ crumb_contacts: '{broken' }));
    expect(plan.blocked).toBeTruthy();
    expect(plan.writes).toEqual({});
  });
});

describe('planPull: the cloud’s field order', () => {
  it('a record that only comes back with its fields in a different order rewrites nothing', () => {
    const saved = {
      crumb_prospects: JSON.stringify([{ name: 'Home Cafe', id: 11, stage: 'warm', notes: [{ text: 'Hi', id: 'n-1', category: 'Visit' }] }]),
      crumb_calendar_events: JSON.stringify([{ title: 'A', id: 1, start: 600 }]),
      crumb_calendar_settings: JSON.stringify({ b: 1, a: 2 }),
    };
    const plan = planPull(
      {
        accounts: [{ id: '11', kind: 'prospect', data: { id: 11, name: 'Home Cafe', stage: 'warm' } }],
        notes: [{ id: 'n-1', account_id: '11', data: { id: 'n-1', category: 'Visit', text: 'Hi' } }],
        events: [{ id: '1', data: { id: 1, start: 600, title: 'A' } }],
        settings: [{ id: 'calendar', data: { a: 2, b: 1 } }],
      },
      reader(saved)
    );
    expect(plan.writes).toEqual({});
  });
});
