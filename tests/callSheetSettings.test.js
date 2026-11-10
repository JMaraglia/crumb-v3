// Call Sheet switches and Did Not Order marks (Nov 10, 2026). Made-up data only.
import { describe, it, expect } from 'vitest';
import { changesFor, syncsKey } from '../src/syncDiff';
import { loadCallSheetSettings, saveCallSheetSettings, writeText } from '../src/store';

const J = (v) => JSON.stringify(v);

describe('Call Sheet switches', () => {
  it('everything is on until it is switched off', () => {
    expect(loadCallSheetSettings()).toEqual({ show: true, online: true, orders: true });
    writeText('crumb_callsheet_settings', 'not json');
    expect(loadCallSheetSettings()).toEqual({ show: true, online: true, orders: true });
  });

  it('a switch turned off stays off', () => {
    saveCallSheetSettings({ show: true, online: false, orders: true });
    expect(loadCallSheetSettings()).toEqual({ show: true, online: false, orders: true });
  });

  it('the switches follow you to your other devices', () => {
    expect(syncsKey('crumb_callsheet_settings')).toBe(true);
    const ch = changesFor('crumb_callsheet_settings', J({ online: true }), J({ online: false }));
    expect(ch[0]).toMatchObject({ table: 'settings', id: 'callSheet', base: { online: true }, next: { online: false } });
  });

  it('Did Not Order marks sync with the Ordered marks for that day', () => {
    const ch = changesFor('crumb_callsheet_ordered', J({ '2026-11-12': [1] }), J({ '2026-11-12': [1, 'no:2'] }));
    expect(ch).toEqual([{ table: 'day_marks', id: 'ordered|2026-11-12', type: 'upsert', base: [1], next: [1, 'no:2'], cols: {} }]);
  });
});

import { loadAppSettings, saveAppSettings } from '../src/store';
describe('tools you can switch off (Calendar, Daily Stops, To-Do)', () => {
  it('all on until switched off; one switch never touches the others', () => {
    expect(loadAppSettings()).toEqual({ calendar: true, dailyStops: true, todo: true, hiddenLabels: [] });
    saveAppSettings({ todo: false });
    saveAppSettings({ calendar: false });
    expect(loadAppSettings()).toEqual({ calendar: false, dailyStops: true, todo: false, hiddenLabels: [] });
  });
  it('follow you to your other devices', () => {
    expect(changesFor('crumb_app_settings', J({}), J({ todo: false }))[0]).toMatchObject({ table: 'settings', id: 'app', next: { todo: false } });
  });
});

describe('note labels you can switch off', () => {
  it('remembers hidden labels and keeps the other switches', () => {
    saveAppSettings({ todo: false });
    saveAppSettings({ hiddenLabels: ['Sample', 'Background'] });
    expect(loadAppSettings()).toEqual({ calendar: true, dailyStops: true, todo: false, hiddenLabels: ['Sample', 'Background'] });
  });
});
