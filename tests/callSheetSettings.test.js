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
    expect(loadAppSettings()).toEqual({ calendar: true, dailyStops: true, todo: true, hiddenLabels: [], labels: null, customLabels: [] });
    saveAppSettings({ todo: false });
    saveAppSettings({ calendar: false });
    expect(loadAppSettings()).toEqual({ calendar: false, dailyStops: true, todo: false, hiddenLabels: [], labels: null, customLabels: [] });
  });
  it('follow you to your other devices', () => {
    expect(changesFor('crumb_app_settings', J({}), J({ todo: false }))[0]).toMatchObject({ table: 'settings', id: 'app', next: { todo: false } });
  });
});

describe('note labels you can switch off', () => {
  it('remembers hidden labels and keeps the other switches', () => {
    saveAppSettings({ todo: false });
    saveAppSettings({ hiddenLabels: ['Sample', 'Background'], labels: null, customLabels: [] });
    expect(loadAppSettings()).toEqual({ calendar: true, dailyStops: true, todo: false, hiddenLabels: ['Sample', 'Background'], labels: null, customLabels: [] });
  });
});

import { labelsInUse, saveLabels, customLabels as ownLabels } from '../src/noteLabels';
import { isCheckable } from '../src/noteStatus';
describe('note labels: in use, your own, and which become to-dos', () => {
  it('starts with the six original labels; old hidden-label setting still respected', () => {
    expect(labelsInUse()).toEqual(['Visit', 'Sample', 'Follow-up', 'Contacted', 'Background', 'Meeting']);
    saveAppSettings({ hiddenLabels: ['Sample'] });
    expect(labelsInUse()).toEqual(['Visit', 'Follow-up', 'Contacted', 'Background', 'Meeting']);
  });
  it('saves the order you pick and your own labels, 12 at most', () => {
    saveLabels(['Visit', 'Proposal', 'Site Walk'], ['Site Walk']);
    expect(labelsInUse()).toEqual(['Visit', 'Proposal', 'Site Walk']);
    expect(ownLabels()).toEqual(['Site Walk']);
    saveLabels(Array.from({ length: 15 }, (_, i) => `L${i}`), []);
    expect(labelsInUse().length).toBe(12);
  });
  it('Proposal and Quote work like Follow-up; custom labels are plain', () => {
    expect(['Follow-up', 'Sample', 'Proposal', 'Quote'].every(isCheckable)).toBe(true);
    expect(isCheckable('Site Walk')).toBe(false);
    expect(isCheckable('Email')).toBe(false);
  });
});
