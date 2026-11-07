import { describe, it, expect } from 'vitest';
import { changesFor, combine, syncsKey } from '../src/syncDiff';
import { onSaved, writeSaved, writeText, readText } from '../src/store';

const J = (v) => JSON.stringify(v);

describe('what changed: customers and prospects', () => {
  it('an edited phone number is one account change with before and after', () => {
    const before = [{ id: 1, name: 'Joe', phone: '111', notes: [] }];
    const after = [{ id: 1, name: 'Joe', phone: '222', notes: [] }];
    const ch = changesFor('crumb_contacts', J(before), J(after));
    expect(ch.length).toBe(1);
    expect(ch[0]).toMatchObject({ table: 'accounts', id: '1', type: 'upsert', cols: { kind: 'customer' } });
    expect(ch[0].base.phone).toBe('111');
    expect(ch[0].next.phone).toBe('222');
    expect('notes' in ch[0].next).toBe(false); // notes travel separately
  });

  it('a new note is a note change only (the account itself did not change)', () => {
    const before = [{ id: 1, name: 'Joe', notes: [] }];
    const after = [{ id: 1, name: 'Joe', notes: [{ id: 'n-1', text: 'hi' }] }];
    const ch = changesFor('crumb_prospects', J(before), J(after));
    expect(ch).toEqual([{ table: 'notes', id: 'n-1', type: 'upsert', base: null, next: { id: 'n-1', text: 'hi' }, cols: { account_id: '1' } }]);
  });

  it('deleting an account also removes its notes', () => {
    const before = [{ id: 1, name: 'Joe', notes: [{ id: 'n-1', text: 'x' }] }];
    const ch = changesFor('crumb_prospects', J(before), J([]));
    expect(ch.map((c) => `${c.table}:${c.type}`).sort()).toEqual(['accounts:delete', 'notes:delete']);
  });

  it('Convert (prospect → customer, same ID) is ONE convert step, and the prospect side is not a delete', () => {
    const prospect = { id: 7, name: 'Bella', stage: 'hot', notes: [{ id: 'n-9', text: 'met' }] };
    const customer = { id: 7, name: 'Bella', accountNumber: 'A1', notes: [{ id: 'n-9', text: 'met' }] };
    // 1) customers saved first, while prospects still has Bella
    const c1 = changesFor('crumb_contacts', J([]), J([customer]), (k) => (k === 'crumb_prospects' ? J([prospect]) : null));
    expect(c1.filter((c) => c.table === 'accounts')).toEqual([
      { table: 'accounts', id: '7', type: 'convert', base: { id: 7, name: 'Bella', stage: 'hot' }, next: { id: 7, name: 'Bella', accountNumber: 'A1' }, cols: { kind: 'customer' } },
    ]);
    // 2) then prospects saved without Bella: no delete of the account or its note
    const c2 = changesFor('crumb_prospects', J([prospect]), J([]), (k) => (k === 'crumb_contacts' ? J([customer]) : null));
    expect(c2).toEqual([]);
  });

  it('unreadable saved text produces nothing (never guesses)', () => {
    expect(changesFor('crumb_contacts', '{broken', J([]))).toEqual([]);
  });
});

describe('what changed: calendar, stops, to-dos, marks, settings', () => {
  it('calendar event changes carry the account and day', () => {
    const ch = changesFor('crumb_calendar_events', J([]), J([{ id: 5, title: 'Meet', date: '2026-11-10', accountId: 7 }]));
    expect(ch[0]).toMatchObject({ table: 'events', id: '5', type: 'upsert', base: null, cols: { account_id: '7', day: '2026-11-10' } });
  });

  it('a removed stop is a delete', () => {
    const ch = changesFor('visitData', J([{ id: 's-1', date: '2026-11-10' }]), J([]));
    expect(ch[0]).toMatchObject({ table: 'stops', id: 's-1', type: 'delete' });
  });

  it('checking off a stop changes that one day only; old days dropped by cleanup are not sent', () => {
    const ch = changesFor('crumb_itinerary_done', J({ '2026-08-01': ['c-1'], '2026-11-10': ['c-1'] }), J({ '2026-11-10': ['c-1', 'p-2'] }));
    expect(ch).toEqual([{ table: 'day_marks', id: 'done|2026-11-10', type: 'upsert', base: ['c-1'], next: ['c-1', 'p-2'], cols: {} }]);
  });

  it('notification settings follow you, but "on for this device" never syncs', () => {
    expect(changesFor('crumb_notify_settings', J({ enabled: false, morningTime: 420 }), J({ enabled: true, morningTime: 420 }))).toEqual([]);
    const ch = changesFor('crumb_notify_settings', J({ enabled: true, morningTime: 420 }), J({ enabled: true, morningTime: 390 }));
    expect(ch[0]).toEqual({ table: 'settings', id: 'notify', type: 'upsert', base: { morningTime: 420 }, next: { morningTime: 390 }, cols: {} });
  });

  it('check-in days (saved as plain text) become a number', () => {
    expect(changesFor('crumb_stale_days', '30', '45')[0]).toMatchObject({ table: 'settings', id: 'staleDays', base: 30, next: 45 });
  });

  it("this phone's own things never sync", () => {
    ['crumb_push_device', 'crumb_maps_app', 'crumb_geo_cache', 'crumb_last_backup', 'crumb_sync_record'].forEach((k) => {
      expect(syncsKey(k)).toBe(false);
      expect(changesFor(k, 'a', 'b')).toEqual([]);
    });
  });
});

describe('combining changes that wait together', () => {
  it('keeps the earliest "before" and the latest "after"', () => {
    const a = { table: 'accounts', id: '1', type: 'upsert', base: { phone: '1' }, next: { phone: '2' } };
    const b = { table: 'accounts', id: '1', type: 'upsert', base: { phone: '2' }, next: { phone: '3' } };
    expect(combine(a, b)).toMatchObject({ base: { phone: '1' }, next: { phone: '3' } });
  });
  it('added then deleted before sending: nothing to send', () => {
    expect(combine({ type: 'upsert', base: null, next: {} }, { type: 'delete', base: {} })).toBe(null);
  });
  it('a convert stays a convert when edited again', () => {
    expect(combine({ type: 'convert', base: { a: 1 }, next: { a: 2 } }, { type: 'upsert', base: { a: 2 }, next: { a: 3 } }).type).toBe('convert');
  });
});

describe('the front door tells listeners only after the save', () => {
  it('a listener hears before/after, and an error inside it cannot break the save', () => {
    const heard = [];
    const off1 = onSaved((k, b, a) => heard.push([k, b, a]));
    const off2 = onSaved(() => { throw new Error('boom'); });
    expect(writeSaved('crumb_todos', [{ id: 1 }])).toBe(true);
    expect(localStorage.getItem('crumb_todos')).toBe('[{"id":1}]');
    expect(heard).toEqual([['crumb_todos', null, '[{"id":1}]']]);
    writeText('crumb_stale_days', 45);
    expect(readText('crumb_stale_days')).toBe('45');
    expect(heard.length).toBe(2);
    off1(); off2();
    writeSaved('crumb_todos', []);
    expect(heard.length).toBe(2); // removed listeners hear nothing
  });
  it('a failed save is not reported as a change', () => {
    const heard = [];
    const off = onSaved((k) => heard.push(k));
    localStorage.full = true;
    expect(writeSaved('crumb_todos', [1])).toBe(false);
    off();
    expect(heard).toEqual([]);
  });
});

import { fullUploadChanges, sendOrder } from '../src/syncDiff';
describe('first upload', () => {
  it('sends everything as "added", accounts first, and never this phone’s own things', () => {
    const saved = {
      crumb_contacts: J([{ id: 1, name: 'A', notes: [{ id: 'n-1', text: 'x' }] }]),
      crumb_prospects: J([{ id: 2, name: 'B', notes: [] }]),
      crumb_calendar_events: J([{ id: 9, title: 'E', date: '2026-11-10', accountId: 1 }]),
      crumb_itinerary_done: J({ '2026-11-10': ['c-1'] }),
      crumb_stale_days: '45',
      crumb_push_device: 'abc',
      crumb_maps_app: 'apple',
    };
    const ch = fullUploadChanges((k) => (k in saved ? saved[k] : null));
    expect(ch.map((c) => `${c.table}:${c.id}`)).toEqual(['accounts:1', 'notes:n-1', 'accounts:2', 'events:9', 'day_marks:done|2026-11-10', 'settings:staleDays']);
    expect(ch.every((c) => c.type === 'upsert' && c.base === null)).toBe(true);
  });
  it('sending order puts accounts before what links to them', () => {
    const list = [{ table: 'notes', at: '1' }, { table: 'events', at: '0' }, { table: 'accounts', at: '2' }].sort(sendOrder);
    expect(list.map((x) => x.table)).toEqual(['accounts', 'notes', 'events']);
  });
});
