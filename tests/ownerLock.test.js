// Security audit, Nov 12 2026: whose device is this? Ownership is only saved after the cloud confirms that the
// records on the device are in the signed-in account. Made-up records and a fake cloud only.
import { describe, it, expect } from 'vitest';
import { ownerState, ownerMayView, verifyOwner, projectRef, OWNER_KEY, GRACE_KEY, MODE_KEY } from '../src/syncMode';

const TOKEN = `sb-${projectRef()}-auth-token`; // where the sign-in is remembered (depends on the cloud address the build was given)
const signIn = (id) => localStorage.setItem(TOKEN, JSON.stringify({ user: { id, email: `${id}@example.invalid` } }));
const device = () => {
  localStorage.setItem(MODE_KEY, 'real');
  localStorage.setItem('crumb_contacts', JSON.stringify([{ id: 1001, name: 'Joe' }, { id: 1002, name: 'Sue' }]));
  localStorage.setItem('crumb_prospects', JSON.stringify([{ id: 2001, name: 'Cafe' }]));
};
// A fake cloud: `mine` = the record IDs the signed-in account has; `down` = no signal.
const cloudFor = (id, mine, { down = false, approved = true } = {}) => ({
  auth: { getSession: async () => ({ data: { session: { user: { id } } } }) },
  rpc: async () => (down ? { data: null, error: { message: 'offline' } } : { data: approved, error: null }),
  from: () => ({ select: () => ({ in: async (_c, ids) => (down ? { data: null, error: { message: 'offline' } } : { data: ids.filter((x) => mine.includes(x)).map((x) => ({ id: x })), error: null }) }) }),
});

describe('device owner (account isolation)', () => {
  it('a device that does not sync, or with nobody signed in, has no owner rule', () => {
    expect(ownerState()).toBe('na');
    device();
    expect(ownerState()).toBe('na');
    expect(ownerMayView()).toBe(true);
  });

  it('with an owner saved: the owner gets in, anyone else does not', () => {
    device();
    localStorage.setItem(OWNER_KEY, 'user-a');
    signIn('user-a');
    expect(ownerState()).toBe('ok');
    signIn('user-b');
    expect(ownerState()).toBe('other');
    expect(ownerMayView()).toBe(false);
  });

  it('no owner saved: a new sign-in sees nothing and is never made the owner on its own', () => {
    device();
    localStorage.setItem(GRACE_KEY, 'none');
    signIn('user-c');
    expect(ownerState()).toBe('unverified');
    expect(ownerMayView()).toBe(false);
    expect(localStorage.getItem(OWNER_KEY)).toBe(null);
  });

  it('no signal or not approved: nothing is decided and no owner is saved', async () => {
    device();
    localStorage.setItem(GRACE_KEY, 'none');
    signIn('user-d');
    expect(await verifyOwner(cloudFor('user-d', ['1001', '1002', '2001'], { down: true }))).toBe('unknown');
    expect(await verifyOwner(cloudFor('user-d', ['1001', '1002', '2001'], { approved: false }))).toBe('unknown');
    expect(localStorage.getItem(OWNER_KEY)).toBe(null);
    expect(ownerState()).toBe('unverified');
  });

  it('the cloud says these records are NOT in this account: locked, no owner saved, nothing on the device changed', async () => {
    device();
    localStorage.setItem(GRACE_KEY, 'none');
    signIn('user-e');
    const before = localStorage.getItem('crumb_contacts');
    expect(await verifyOwner(cloudFor('user-e', []))).toBe('mismatch');
    expect(localStorage.getItem(OWNER_KEY)).toBe(null);
    expect(ownerState()).toBe('other');
    expect(localStorage.getItem('crumb_contacts')).toBe(before);
  });

  it('the cloud confirms the records are in this account: only then is the owner saved', async () => {
    device();
    localStorage.setItem(GRACE_KEY, 'none');
    signIn('user-f');
    expect(await verifyOwner(cloudFor('user-f', ['1001', '1002', '2001']))).toBe('ok');
    expect(localStorage.getItem(OWNER_KEY)).toBe('user-f');
    expect(ownerState()).toBe('ok');
    // and from then on a different account is refused without asking again
    expect(await verifyOwner(cloudFor('user-g', ['1001', '1002', '2001']))).toBe('mismatch');
    expect(localStorage.getItem(OWNER_KEY)).toBe('user-f');
  });

  it('whoever was already using the device keeps seeing it, but is not the owner until the cloud confirms', async () => {
    device();
    localStorage.setItem(GRACE_KEY, 'user-h');
    signIn('user-h');
    expect(ownerState()).toBe('grace');
    expect(ownerMayView()).toBe(true);
    expect(localStorage.getItem(OWNER_KEY)).toBe(null);
    expect(await verifyOwner(cloudFor('user-h', []))).toBe('mismatch');
    expect(ownerState()).toBe('other');
  });

  it('a device with nothing saved on it has nothing to protect: the signed-in account becomes the owner', async () => {
    localStorage.setItem(MODE_KEY, 'real');
    localStorage.setItem(GRACE_KEY, 'none');
    signIn('user-i');
    expect(await verifyOwner(cloudFor('user-i', []))).toBe('ok');
    expect(localStorage.getItem(OWNER_KEY)).toBe('user-i');
  });
});
