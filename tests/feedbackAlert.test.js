// Inbox alerts (Nov 7 2026): a new ticket pings every Crumb admin's phones, nobody else's;
// only signed-in people can trigger it, at most 5 an hour each.
// Runs the real server code (api/) against a fake Redis, fake sign-in and fake phones.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

describe('new-ticket alerts', () => {
  it('go to admins only, need a sign-in, and are rate-limited', async () => {
    const realFetch = globalThis.fetch;
    const b64u = (b) => Buffer.from(b).toString('base64url');
    const v = crypto.createECDH('prime256v1'); v.generateKeys();
    process.env.VAPID_PUBLIC_KEY = b64u(v.getPublicKey()); process.env.VAPID_PRIVATE_KEY = b64u(v.getPrivateKey());
    process.env.KV_REST_API_URL = 'https://kv.test'; process.env.KV_REST_API_TOKEN = 't';
    process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co'; process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'pk';
    const kv = new Map(); const sets = new Map();
    const redis = (c) => { const [cmd, k, ...a] = c; switch (cmd) {
      case 'GET': return kv.has(k) ? kv.get(k) : null;
      case 'SET': if (a.includes('NX') && kv.has(k)) return null; kv.set(k, a[0]); return 'OK';
      case 'DEL': kv.delete(k); return 1;
      case 'INCR': { const n = Number(kv.get(k) || 0) + 1; kv.set(k, String(n)); return n; }
      case 'EXPIRE': return 1;
      case 'SADD': (sets.get(k) || sets.set(k, new Set()).get(k)).add(a[0]); return 1;
      case 'SREM': sets.get(k)?.delete(a[0]); return 1;
      case 'SMEMBERS': return [...(sets.get(k) || [])];
    } };
    const pushes = [];
    const USERS = { tokAdmin: '11111111-1111-4111-8111-111111111111', tokRep: '22222222-2222-4222-8222-222222222222' };
    globalThis.fetch = async (url, opt = {}) => {
      const u = String(url);
      const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o });
      const tok = ((opt.headers && opt.headers.Authorization) || '').replace('Bearer ', '');
      if (u.startsWith('https://kv.test')) return json({ result: redis(JSON.parse(opt.body)) });
      if (u === 'https://proj.supabase.co/auth/v1/user') return USERS[tok] ? json({ id: USERS[tok] }) : json({}, 401);
      if (u === 'https://proj.supabase.co/rest/v1/rpc/is_admin') return json(tok === 'tokAdmin');
      if (u.startsWith('https://push.test/')) { pushes.push(u); return json({}, 201); }
      throw new Error('unexpected fetch ' + u);
    };
    const phone = (name) => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { endpoint: `https://push.test/${name}`, keys: { p256dh: b64u(e.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } }; };
    const sync = (await import('../api/push-sync.js')).default;
    const alert = (await import('../api/feedback-alert.js')).default;
    const call = async (h, { body, auth } = {}) => { let out; const res = { status: (s) => ({ json: (o) => (out = { s, o }) }), setHeader() {} }; await h({ method: 'POST', body, query: {}, headers: auth ? { authorization: `Bearer ${auth}` } : {} }, res); return out; };
    const dev = (n) => n.repeat(32).slice(0, 32);

    // Founder's iPhone + iPad (admin) and a rep's phone, all with reminders on
    await call(sync, { body: { deviceId: dev('a'), subscription: phone('admin-iphone'), notifications: [], token: 'tokAdmin' } });
    await call(sync, { body: { deviceId: dev('b'), subscription: phone('admin-ipad'), notifications: [], token: 'tokAdmin' } });
    await call(sync, { body: { deviceId: dev('c'), subscription: phone('rep-phone'), notifications: [], token: 'tokRep' } });

    const results = [];
    let r = await call(alert, { body: { id: 7, kind: 'problem', area: 'Calendar', message: 'Event vanished' }, auth: 'tokRep' });
    results.push(['rep ticket alerts both admin devices', r.s === 200 && r.o.sent === 2]);
    results.push(['the rep\'s own phone is not alerted', !pushes.some((p) => p.endsWith('/rep-phone'))]);
    r = await call(alert, { body: { id: 8, kind: 'problem', message: 'x' } });
    results.push(['signed-out call refused', r.s === 401]);
    for (let i = 0; i < 5; i += 1) await call(alert, { body: { id: 9 + i, kind: 'suggestion', message: 'x' }, auth: 'tokRep' });
    r = await call(alert, { body: { id: 20, kind: 'problem', message: 'x' }, auth: 'tokRep' });
    results.push(['6th alert in an hour is skipped', r.s === 200 && r.o.skipped === 'limit']);

    globalThis.fetch = realFetch;
    const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
    expect(failed).toEqual([]);
  });
});
