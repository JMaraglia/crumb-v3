// S8 (Nov 7 2026): reminders filed under the account: each reminder once per device, never twice.
// Runs the real server code (api/) against a fake Redis, fake sign-in and fake phones.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

describe('account reminders (S8)', () => {
  it('each reminder goes once to each device that has notifications on, and to nobody else', async () => {
    const realFetch = globalThis.fetch;
    const b64u = (b) => Buffer.from(b).toString('base64url');
    // VAPID keys
    const v = crypto.createECDH('prime256v1'); v.generateKeys();
    process.env.VAPID_PUBLIC_KEY = b64u(v.getPublicKey()); process.env.VAPID_PRIVATE_KEY = b64u(v.getPrivateKey());
    process.env.KV_REST_API_URL = 'https://kv.test'; process.env.KV_REST_API_TOKEN = 't';
    process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co'; process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'pk';
    process.env.CRON_SECRET = 'cron';
    // fake redis
    const kv = new Map(); const sets = new Map();
    const redis = (c) => { const [cmd, k, ...a] = c; switch (cmd) {
      case 'GET': return kv.has(k) ? kv.get(k) : null;
      case 'SET': if (a.includes('NX') && kv.has(k)) return null; kv.set(k, a[0]); return 'OK';
      case 'DEL': kv.delete(k); return 1;
      case 'SADD': (sets.get(k) || sets.set(k, new Set()).get(k)).add(a[0]); return 1;
      case 'SREM': sets.get(k)?.delete(a[0]); return 1;
      case 'SMEMBERS': return [...(sets.get(k) || [])];
    } };
    const pushes = []; const goneEndpoints = new Set();
    const USERS = { tokA: '11111111-1111-4111-8111-111111111111', tokB: '22222222-2222-4222-8222-222222222222' };
    globalThis.fetch = async (url, opt = {}) => {
      const u = String(url);
      const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o });
      if (u.startsWith('https://kv.test')) return json({ result: redis(JSON.parse(opt.body)) });
      if (u === 'https://proj.supabase.co/auth/v1/user') { const t = (opt.headers.Authorization || '').replace('Bearer ', ''); return USERS[t] ? json({ id: USERS[t] }) : json({}, 401); }
      if (u.startsWith('https://push.test/')) { if (goneEndpoints.has(u)) return json({}, 410); pushes.push(u); return json({}, 201); }
      throw new Error('unexpected fetch ' + u);
    };
    const phone = (name) => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { endpoint: `https://push.test/${name}`, keys: { p256dh: b64u(e.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } }; };
    const MODS = { 'push-sync': () => import('../api/push-sync.js'), 'push-tick': () => import('../api/push-tick.js'), 'push-test': () => import('../api/push-test.js') };
    const call = async (mod, body, query) => { const h = (await MODS[mod]()).default; let out; const res = { status: (s) => ({ json: (o) => (out = { s, o }) }), setHeader() {} }; await h({ method: body ? 'POST' : 'GET', body, query: query || {}, headers: {} }, res); return out; };
    const dev = (n) => n.repeat(32).slice(0, 32);
    const iphone = phone('iphone'), ipad = phone('ipad'), wife = phone('wife');
    const past = new Date(Date.now() - 60000).toISOString(), future = new Date(Date.now() + 3600000).toISOString();
    const list = [{ id: 'r-1', at: past, title: 'Home Cafe · 9:30', body: 'In 30 min', url: '/itinerary' }, { id: 'm-1', at: future, title: 'Tomorrow', body: '', url: '/' }];
    const results = []; const check = (name, cond) => results.push([name, Boolean(cond)]);
    
    // old-style device (wife) still works
    let r = await call('push-sync', { deviceId: dev('c'), subscription: wife, notifications: list });
    check('wife: old per-device sync works', r.s === 200 && !r.o.account);
    // iPhone registers old-style first (before S8), then switches to account mode -> old record forgotten
    await call('push-sync', { deviceId: dev('a'), subscription: iphone, notifications: list });
    r = await call('push-sync', { deviceId: dev('a'), subscription: iphone, notifications: list, token: 'tokA' });
    check('iPhone account sync', r.s === 200 && r.o.account === true);
    check('iPhone old per-device record removed', !kv.has(`crumb:dev:${dev('a')}`));
    r = await call('push-sync', { deviceId: dev('b'), subscription: ipad, notifications: list, token: 'tokA' });
    check('iPad joins same account', r.s === 200);
    r = await call('push-sync', { deviceId: dev('b'), subscription: ipad, notifications: list, token: 'bogus' });
    check('bad sign-in refused', r.s === 401);
    // tick twice (overlapping timers): each device gets r-1 exactly once; future one not sent
    await Promise.all([call('push-tick', null, { key: 'cron' }), call('push-tick', null, { key: 'cron' })]);
    await call('push-tick', null, { key: 'cron' });
    const count = (n) => pushes.filter((p) => p.endsWith('/' + n)).length;
    check('iPhone got the due reminder once', count('iphone') === 1, `(${count('iphone')})`);
    check('iPad got the due reminder once', count('ipad') === 1, `(${count('ipad')})`);
    
    // the iPad sends the same list again (both devices hold the same data): no repeat
    await call('push-sync', { deviceId: dev('b'), subscription: ipad, notifications: list, token: 'tokA' });
    await call('push-tick', null, { key: 'cron' });
    check('re-sent list does not repeat a sent reminder', count('iphone') === 1 && count('ipad') === 1);
    // iPad turns notifications off: only iPhone gets the next one
    await call('push-sync', { deviceId: dev('b'), off: true, token: 'tokA' });
    const list2 = [{ id: 'r-2', at: past, title: 'Next', body: '', url: '/' }];
    await call('push-sync', { deviceId: dev('a'), subscription: iphone, notifications: list2, token: 'tokA' });
    await call('push-tick', null, { key: 'cron' });
    check('device switched off gets nothing', count('ipad') === 1 && count('iphone') === 2, `(iphone ${count('iphone')}, ipad ${count('ipad')})`);
    // another person never gets this account's reminders
    await call('push-sync', { deviceId: dev('d'), subscription: phone('other'), notifications: [], token: 'tokB' });
    await call('push-tick', null, { key: 'cron' });
    check("someone else's account gets nothing", count('other') === 0);
    // an unsubscribed phone is forgotten
    goneEndpoints.add('https://push.test/iphone');
    await call('push-sync', { deviceId: dev('a'), subscription: iphone, notifications: [{ id: 'r-3', at: past, title: 'x', body: '', url: '/' }], token: 'tokA' });
    await call('push-tick', null, { key: 'cron' });
    check('unsubscribed phone forgotten', !JSON.parse(kv.get(`crumb:user:${USERS.tokA}`)).devices[dev('a')]);
    // test notification in account mode
    await call('push-sync', { deviceId: dev('b'), subscription: ipad, notifications: [], token: 'tokA' });
    r = await call('push-test', { deviceId: dev('b'), token: 'tokA' });
    check('test notification (account)', r.s === 200 && count('ipad') === 2);
    
    globalThis.fetch = realFetch;
    const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
    expect(failed).toEqual([]);
    expect(results.length).toBe(12);
  });
});
