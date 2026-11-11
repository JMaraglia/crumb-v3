import { describe, it, expect } from 'vitest';
import { inspectForMove, verifyMatch } from '../src/syncMove';
import { syncBlockReason, TEST_PROJECT } from '../src/syncMode';

const reader = (saved) => (k) => (k in saved ? saved[k] : null);
const saved = {
  crumb_contacts: JSON.stringify([{ id: 1, name: 'Joe', notes: [{ id: 'n-1', text: 'Hi' }] }]),
  crumb_prospects: JSON.stringify([{ id: 11, name: 'Cafe', notes: [] }]),
  crumb_calendar_events: JSON.stringify([{ id: 5, title: 'Tasting', date: '2026-11-09', accountId: 11 }, { id: 6, title: 'Old', date: '2026-11-09', accountId: 999 }]),
  crumb_todos: JSON.stringify([{ id: 't1', text: 'Call' }]),
};

describe('Move My Data: dry run (S7)', () => {
  it('counts what would move and sends links to deleted accounts without the link', () => {
    const r = inspectForMove(reader(saved), [{ id: 'p1', key: 'prospect-11' }, { id: 'p2', key: 'customer-77' }]);
    expect(r.counts).toMatchObject({ customers: 1, prospects: 1, notes: 1, events: 2, todos: 1, photos: 1 });
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toHaveLength(2);
    const old = r.changes.find((c) => c.table === 'events' && c.id === '6');
    expect(old.cols.account_id).toBe(null);
    expect(old.next.accountId).toBe(999); // the item itself is unchanged
  });
  it('blocks when a prospect and a customer share an ID', () => {
    const r = inspectForMove(reader({ ...saved, crumb_prospects: JSON.stringify([{ id: 1, name: 'Dup' }]) }));
    expect(r.blockers.length).toBe(1);
  });
});

describe('Move My Data: verify (S7)', () => {
  const r = inspectForMove(reader(saved));
  const asCloud = (changes) => {
    const out = { accounts: [], notes: [], events: [], stops: [], todos: [], day_marks: [], settings: [] };
    changes.forEach((c) => out[c.table].push({ id: String(c.id), kind: c.cols && c.cols.kind, account_id: c.cols && c.cols.account_id != null ? String(c.cols.account_id) : null, data: JSON.parse(JSON.stringify(c.next)) }));
    return out;
  };
  it('a perfect copy matches', () => {
    const v = verifyMatch(r.changes, asCloud(r.changes), ['p1'], ['p1']);
    expect(v.ok).toBe(true);
  });
  it('finds a missing record, a changed one, an extra one and a missing photo', () => {
    const cloud = asCloud(r.changes);
    cloud.todos = [];
    cloud.events[0].data.title = 'Different';
    cloud.notes.push({ id: 'n-x', account_id: '1', data: { text: 'extra' } });
    const v = verifyMatch(r.changes, cloud, ['p1'], []);
    expect(v.ok).toBe(false);
    expect(v.problemCount).toBe(4);
  });
  it('ignores deleted marks and unrelated cloud settings', () => {
    const cloud = asCloud(r.changes);
    cloud.notes.push({ id: 'n-gone', data: {}, deleted: true });
    cloud.settings.push({ id: 'cloud_test', data: {} });
    expect(verifyMatch(r.changes, cloud).ok).toBe(true);
  });
  it("a live note on a deleted customer isn't expected on the device (it can't show anywhere)", () => {
    const cloud = asCloud(r.changes);
    cloud.accounts.push({ id: '77', kind: 'customer', data: {}, deleted: true });
    cloud.notes.push({ id: 'n-orphan', account_id: '77', data: { text: 'left behind' } });
    expect(verifyMatch(r.changes, cloud).ok).toBe(true);
  });
  it('after a download, a setting only this device has is fine; when moving up, it must be in the cloud', () => {
    const r2 = inspectForMove(reader({ ...saved, crumb_stale_days: '45' }));
    expect(r2.changes.some((c) => c.table === 'settings')).toBe(true);
    const cloud = asCloud(r2.changes);
    cloud.settings = [];
    expect(verifyMatch(r2.changes, cloud, [], [], { download: true }).ok).toBe(true);
    expect(verifyMatch(r2.changes, cloud).ok).toBe(false);
  });
});

describe('which devices sync (S7)', () => {
  const read = (m) => (k) => m[k] ?? null;
  it('a test copy syncs only with the test cloud', () => {
    expect(syncBlockReason(TEST_PROJECT, read({ crumb_sync_test_device: '1' }), false)).toBe('');
    expect(syncBlockReason('prodref', read({ crumb_sync_test_device: '1' }), false)).toBe('test-copy-locked');
  });
  it('a real device syncs only with the cloud it moved to, and can be paused', () => {
    const dev = { crumb_sync_mode: 'real', crumb_sync_project: 'prodref' };
    expect(syncBlockReason('prodref', read(dev), false)).toBe('');
    expect(syncBlockReason('otherref', read(dev), false)).toBe('other-project');
    expect(syncBlockReason('prodref', read({ ...dev, crumb_sync_paused: '1' }), false)).toBe('paused');
  });
  it('off by default, and the kill switch stops everything', () => {
    expect(syncBlockReason('prodref', read({}), false)).toBe('off');
    // Nov 11: a device set up for one account doesn't sync for another; no owner saved or nobody signed in changes nothing.
    const owned = { crumb_sync_mode: 'real', crumb_sync_project: 'prodref', crumb_sync_owner: 'user-a' };
    expect(syncBlockReason('prodref', read(owned), false, 'user-a')).toBe('');
    expect(syncBlockReason('prodref', read(owned), false, 'user-b')).toBe('other-account');
    expect(syncBlockReason('prodref', read(owned), false, '')).toBe('');
    expect(syncBlockReason('prodref', read({ crumb_sync_mode: 'real', crumb_sync_project: 'prodref' }), false, 'user-b')).toBe('');
    expect(syncBlockReason('prodref', read({ crumb_sync_mode: 'real', crumb_sync_project: 'prodref' }), true)).toBe('kill-switch');
  });
});

describe('who may move real data (S7)', () => {
  it('only approved emails', async () => {
    const { maySync } = await import('../src/syncMode');
    expect(maySync('jmaraglia@gmail.com')).toBe(true);
    expect(maySync(' JMaraglia@Gmail.com ')).toBe(true);
    expect(maySync('someone@example.com')).toBe(false);
    expect(maySync('')).toBe(false);
  });
});
