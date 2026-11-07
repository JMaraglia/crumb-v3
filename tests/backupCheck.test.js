import { describe, it, expect } from 'vitest';
import { makeManifest, compareToManifest, countData, isBackedUpKey, fingerprint } from '../src/backupCheck';

const data = {
  crumb_contacts: JSON.stringify([{ id: 1, name: 'A', notes: [{ text: 'x' }, { text: 'y' }] }]),
  crumb_prospects: JSON.stringify([{ id: 2, name: 'B', notes: [] }]),
  crumb_calendar_events: JSON.stringify([{ id: 9 }]),
  visitData: JSON.stringify([{ id: 3 }]),
};

describe('backup checks', () => {
  it('counts what is in a backup', () => {
    expect(countData(data, 2)).toMatchObject({ customers: 1, prospects: 1, notes: 2, events: 1, stops: 1, photos: 2, items: 4 });
  });

  it('a complete backup matches its own list', () => {
    expect(compareToManifest(makeManifest(data, ['p1']), data, ['p1'])).toEqual([]);
  });

  it('catches a changed item, a missing item and a missing photo', () => {
    const m = makeManifest(data, ['p1', 'p2']);
    const changed = { ...data, crumb_contacts: data.crumb_contacts.replace('A', 'Z') };
    delete changed.visitData;
    const problems = compareToManifest(m, changed, ['p1']);
    expect(problems.some((p) => p.includes('crumb_contacts'))).toBe(true);
    expect(problems.some((p) => p.includes('visitData'))).toBe(true);
    expect(problems.some((p) => p.includes('photo'))).toBe(true);
  });

  it("this phone's notification ID is never part of a backup", () => {
    expect(isBackedUpKey('crumb_push_device')).toBe(false);
    expect(isBackedUpKey('crumb_contacts')).toBe(true);
    expect(isBackedUpKey('visitData')).toBe(true);
    expect(isBackedUpKey('something_else')).toBe(false);
  });

  it('a fingerprint changes when one character changes', () => {
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
  });
});
