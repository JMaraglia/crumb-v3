import { describe, it, expect } from 'vitest';
import { planPhotoPush, planPhotoPull, splitKey } from '../src/syncPhotos';

describe('photos up (S6)', () => {
  it('new photos go up, moved ones follow, deleted ones are marked', () => {
    const plan = planPhotoPush(
      [{ id: 'a', key: 'prospect-11' }, { id: 'b', key: 'customer-11' }],
      { b: 'prospect-11', c: 'customer-3' }
    );
    expect(plan.up.map((p) => p.id)).toEqual(['a']);
    expect(plan.moved.map((p) => p.id)).toEqual(['b']);
    expect(plan.gone).toEqual(['c']);
    expect(plan.blocked).toBe(false);
  });
  it('safety brake: if most photos vanish from this device, nothing is deleted in the cloud', () => {
    const sent = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, 'customer-1']));
    const plan = planPhotoPush([{ id: 'p0', key: 'customer-1' }], sent);
    expect(plan.blocked).toBe(true);
    expect(plan.gone).toEqual([]);
  });
});

describe('photos down (S6)', () => {
  const keyFor = (id) => ({ 11: 'prospect-11', 3: 'customer-3' })[id] || null;
  it('downloads new ones, follows moves, removes deleted ones, skips unknown accounts', () => {
    const local = new Map([['b', { key: 'prospect-11' }], ['c', { key: 'customer-3' }]]);
    const plan = planPhotoPull(
      [
        { id: 'a', account_id: '11' },
        { id: 'b', account_id: '3' },
        { id: 'c', account_id: '3', deleted_at: '2026-11-07T10:00:00Z' },
        { id: 'z', account_id: '999' },
        { id: 'y', account_id: '11', deleted_at: '2026-11-07T10:00:00Z' },
      ],
      local,
      keyFor
    );
    expect(plan.download.map((d) => [d.row.id, d.key])).toEqual([['a', 'prospect-11']]);
    expect(plan.rekey).toEqual([{ id: 'b', key: 'customer-3' }]);
    expect(plan.remove).toEqual(['c']);
  });
  it('a photo already here and unchanged does nothing', () => {
    const plan = planPhotoPull([{ id: 'b', account_id: '11' }], new Map([['b', { key: 'prospect-11' }]]), keyFor);
    expect(plan.download).toEqual([]);
    expect(plan.rekey).toEqual([]);
  });
  it('safety brake on removals', () => {
    const local = new Map(Array.from({ length: 10 }, (_, i) => [`p${i}`, { key: 'customer-3' }]));
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, account_id: '3', deleted_at: 'x' }));
    const plan = planPhotoPull(rows, local, keyFor);
    expect(plan.blocked).toBe(true);
    expect(plan.remove).toEqual([]);
  });
  it('reads account keys', () => {
    expect(splitKey('prospect-11')).toEqual({ type: 'prospect', id: '11' });
    expect(splitKey('customer-c-12')).toEqual({ type: 'customer', id: 'c-12' });
    expect(splitKey('')).toBe(null);
  });
});
