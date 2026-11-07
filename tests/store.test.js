import { describe, it, expect } from 'vitest';
import {
  readSaved, writeSaved, loadCustomers, loadEvents, loadStops, loadDayMap, loadTodos,
  withNoteIds, changeNote, dropNote, findNoteIndex, upgradeStopIds,
  stampOf, withStandardDates, readText, writeText, loadObject,
} from '../src/store';

const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
const get = (k) => JSON.parse(localStorage.getItem(k));

describe('the front door: reading and saving', () => {
  it('reads saved lists, and gives an empty list when nothing is saved', () => {
    expect(loadCustomers()).toEqual([]);
    set('crumb_contacts', [{ id: 1, name: 'A' }]);
    expect(loadCustomers()).toEqual([{ id: 1, name: 'A' }]);
  });

  it('never throws away damaged saved data: an untouched copy is set aside', () => {
    set('crumb_calendar_events', '{broken');
    expect(loadEvents()).toEqual([]);
    expect(localStorage.getItem('crumb_calendar_events__unreadable')).toBe('{broken');
    expect(localStorage.getItem('crumb_calendar_events')).toBe('{broken'); // original untouched
    set('visitData', '[oops');
    expect(loadStops()).toEqual([]);
    expect(localStorage.getItem('visitData__unreadable')).toBe('[oops');
    set('crumb_todos', 'nope{');
    expect(loadTodos()).toEqual([]);
    expect(localStorage.getItem('crumb_todos__unreadable')).toBe('nope{');
  });

  it('a save on a full phone returns false and raises the "couldn\'t save" banner', () => {
    let banner = false;
    window.dispatchEvent = (e) => { banner = e.type === 'crumb-save-failed'; return true; };
    localStorage.full = true;
    expect(writeSaved('crumb_contacts', [])).toBe(false);
    expect(banner).toBe(true);
  });

  it('reads old stops saved grouped by date as one list', () => {
    set('visitData', { '2026-11-10': [{ id: 1 }], '2026-11-11': [{ id: 2 }] });
    expect(loadStops().map((v) => v.id)).toEqual([1, 2]);
  });

  it('per-day maps are always objects', () => {
    set('crumb_itinerary_locks', [1, 2]);
    expect(loadDayMap('crumb_itinerary_locks')).toEqual({});
    set('crumb_itinerary_locks', { '2026-11-10': { 'p-1': 600 } });
    expect(loadDayMap('crumb_itinerary_locks')['2026-11-10']['p-1']).toBe(600);
  });

  it('plain-text settings read and write as text', () => {
    expect(readText('crumb_stale_days')).toBe(null);
    writeText('crumb_stale_days', 45);
    expect(readText('crumb_stale_days')).toBe('45');
    set('crumb_notify_settings', [1]);
    expect(loadObject('crumb_notify_settings')).toEqual({});
  });

  it('readSaved keeps a saved null only when asked', () => {
    set('x', 'null');
    expect(readSaved('x', 'fb')).toBe('fb');
    expect(readSaved('x', 'fb', { keepNull: true })).toBe(null);
  });
});

describe('note ID tags', () => {
  it('gives every untagged note a unique tag and leaves tagged ones alone', () => {
    const accts = [{ id: 1, notes: [{ text: 'a' }, { id: 'n-keep', text: 'b' }, { text: 'c' }] }];
    const out = withNoteIds(accts);
    const ids = out[0].notes.map((n) => n.id);
    expect(ids[1]).toBe('n-keep');
    expect(ids[0]).toMatch(/^n-/);
    expect(new Set(ids).size).toBe(3);
    expect(out[0].notes.map((n) => n.text)).toEqual(['a', 'b', 'c']);
  });

  it('returns the very same list when every note already has a tag (so nothing is re-saved)', () => {
    const accts = [{ id: 1, notes: [{ id: 'n-1' }] }, { id: 2 }];
    expect(withNoteIds(accts)).toBe(accts);
  });

  it('a change goes to the note with that tag, even if its position moved', () => {
    const notes = [{ id: 'a', t: 1 }, { id: 'b', t: 2 }];
    expect(changeNote(notes, { id: 'b', index: 0 }, { t: 9 })).toEqual([{ id: 'a', t: 1 }, { id: 'b', t: 9 }]);
  });

  it('never changes the wrong note: a tag that is gone changes nothing', () => {
    const notes = [{ id: 'a' }, { id: 'b' }];
    expect(changeNote(notes, { id: 'zzz', index: 0 }, { t: 9 })).toBe(notes);
    expect(dropNote(notes, { id: 'zzz', index: 1 })).toBe(notes);
  });

  it('a replaced note keeps its tag; delete removes only that note', () => {
    const notes = [{ id: 'a', t: 1 }, { id: 'b', t: 2 }, { t: 3 }];
    expect(changeNote(notes, { id: 'a' }, () => ({ t: 5 }))[0]).toEqual({ t: 5, id: 'a' });
    expect(dropNote(notes, { id: 'b', index: 0 })).toEqual([{ id: 'a', t: 1 }, { t: 3 }]);
    expect(findNoteIndex(notes, { index: 2 })).toBe(2); // untagged: by position
    expect(findNoteIndex(notes, 5)).toBe(-1);
  });
});

describe('old itinerary stops get tags', () => {
  it('tags untagged stops and moves their per-day marks on that day only', () => {
    set('visitData', [
      { id: 1730000000000, date: '2026-11-10', name: 'Tagged' },
      { date: '2026-11-10', name: 'Old one' },
      { date: '2026-11-12', name: 'Old two' },
    ]);
    set('crumb_itinerary_locks', { '2026-11-10': { 'm-1': 600, 'm-1730000000000': 540 }, '2026-11-12': { 'm-1': 999 } });
    set('crumb_itinerary_removed', { '2026-11-12': ['m-2'] });
    expect(upgradeStopIds()).toBe(2);
    const stops = get('visitData');
    expect(stops[0].id).toBe(1730000000000);
    expect(stops[1].id).toMatch(/^s-/);
    const locks = get('crumb_itinerary_locks');
    expect(locks['2026-11-10'][`m-${stops[1].id}`]).toBe(600);
    expect(locks['2026-11-10']['m-1730000000000']).toBe(540);
    expect(locks['2026-11-12']['m-1']).toBe(999); // a different day: untouched
    expect(get('crumb_itinerary_removed')['2026-11-12']).toEqual([`m-${stops[2].id}`]);
  });

  it('saves nothing when every stop already has a tag', () => {
    set('visitData', [{ id: 5, date: '2026-11-10' }]);
    const before = localStorage.getItem('visitData');
    expect(upgradeStopIds()).toBe(0);
    expect(localStorage.getItem('visitData')).toBe(before);
  });

  it('on a full phone, puts everything back as it was', () => {
    set('visitData', [{ date: '2026-11-10' }]);
    set('crumb_itinerary_locks', { '2026-11-10': { 'm-0': 600 } });
    const before = [localStorage.getItem('visitData'), localStorage.getItem('crumb_itinerary_locks')];
    localStorage.full = true;
    expect(upgradeStopIds()).toBe(0);
    localStorage.full = false;
    expect([localStorage.getItem('visitData'), localStorage.getItem('crumb_itinerary_locks')]).toEqual(before);
  });
});

describe('standard dates', () => {
  it('saves times with the local time zone, and reads back as the same moment', () => {
    const d = new Date(2026, 10, 6, 20, 15, 0);
    const s = stampOf(d);
    expect(s).toMatch(/^2026-11-06T20:15:00[+-]\d{2}:\d{2}$/);
    expect(Date.parse(s)).toBe(d.getTime());
  });

  it('converts old phone-text times, keeps the original, and leaves unreadable ones alone', () => {
    const accts = [{
      id: 1,
      convertedAt: '11/1/2026, 3:04:05 PM',
      notes: [
        { id: 'a', timestamp: '11/6/2026, 8:15:00 PM' },
        { id: 'b', timestamp: 'sometime last week' },
        { id: 'c', timestamp: '2026-11-05T10:00:00-05:00' },
      ],
    }];
    const out = withStandardDates(accts)[0];
    expect(Date.parse(out.notes[0].timestamp)).toBe(Date.parse('11/6/2026, 8:15:00 PM'));
    expect(out.notes[0].timestampText).toBe('11/6/2026, 8:15:00 PM');
    expect(out.notes[1]).toEqual({ id: 'b', timestamp: 'sometime last week' });
    expect(out.notes[2]).toBe(accts[0].notes[2]); // already standard: untouched
    expect(out.convertedAtText).toBe('11/1/2026, 3:04:05 PM');
    expect(Date.parse(out.convertedAt)).toBe(Date.parse('11/1/2026, 3:04:05 PM'));
  });

  it('returns the very same list when there is nothing to convert', () => {
    const accts = [{ id: 1, notes: [{ timestamp: '2026-11-05T10:00:00-05:00' }] }];
    expect(withStandardDates(accts)).toBe(accts);
  });
});
