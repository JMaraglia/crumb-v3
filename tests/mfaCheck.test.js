// Daily authenticator code (Nov 2026): "was a code entered on this device today?" is read from the sign-in.
import { describe, it, expect, beforeEach } from 'vitest';
import { codeEnteredToday, lastCodeTime } from '../src/mfaCheck';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const session = (amr) => ({ access_token: `${b64u({ alg: 'HS256' })}.${b64u({ sub: 'u', aal: 'aal2', amr })}.sig` });
const secs = (d) => Math.floor(d.getTime() / 1000);

describe('daily code check', () => {
  it('today, yesterday, never', () => {
    const now = new Date();
    const earlyToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 30);
    const lateYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 30);
    const results = [
      ['code entered today counts', codeEnteredToday(session([{ method: 'password', timestamp: secs(lateYesterday) }, { method: 'totp', timestamp: secs(earlyToday) }]))],
      ['code from 11:59 PM yesterday does not', !codeEnteredToday(session([{ method: 'totp', timestamp: secs(lateYesterday) }]))],
      ['password only does not', !codeEnteredToday(session([{ method: 'password', timestamp: secs(now) }]))],
      ['no sign-in does not', !codeEnteredToday(null)],
      ['garbage token does not', !codeEnteredToday({ access_token: 'not-a-token' })],
      ['latest code time is read', lastCodeTime(session([{ method: 'totp', timestamp: 100 }, { method: 'totp', timestamp: 200 }])) === 200000],
    ];
    expect(results.filter(([, ok]) => !ok).map(([n]) => n)).toEqual([]);
  });
});
