// file: api/_push.js  (files starting with "_" are helpers, not web addresses)
// Sends Web Push notifications with Node's built-in crypto (no extra packages).
// Standards: RFC 8291 (message encryption, aes128gcm) and RFC 8292 (VAPID sender keys).
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

// VAPID: proves to Apple/Google that the notification comes from Crumb's server.
function vapidHeader(endpoint, publicKey, privateKey, subject) {
  const pub = fromB64u(publicKey); // 65 bytes: 0x04 | x | y
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: b64u(fromB64u(privateKey)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(
    JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })
  );
  const unsigned = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(sig)}, k=${publicKey}`;
}

// Encrypt the message so only that phone can read it (aes128gcm).
export function encryptPayload(subscription, payload) {
  const uaPublic = fromB64u(subscription.keys.p256dh);
  const authSecret = fromB64u(subscription.keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const plain = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]); // 2 = last (only) record
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Send one notification. Returns { ok, status, gone } (gone = phone unsubscribed; forget it).
export async function sendPush(subscription, message) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'https://crumb-v3.vercel.app';
  if (!publicKey || !privateKey) throw new Error('Notification keys are not set up in Vercel yet.');
  const body = encryptPayload(subscription, JSON.stringify(message));
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidHeader(subscription.endpoint, publicKey, privateKey, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

/* ---------- Tiny storage (Upstash Redis, connected through Vercel's Storage tab) ---------- */
function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Storage is not connected in Vercel yet.');
  return async (...command) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  };
}

const devKey = (id) => `crumb:dev:${id}`;
export const validDeviceId = (id) => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);

export async function loadDevice(id) {
  const raw = await store()('GET', devKey(id));
  return raw ? JSON.parse(raw) : null;
}

export async function saveDevice(id, data) {
  const run = store();
  await run('SET', devKey(id), JSON.stringify(data));
  await run('SADD', 'crumb:devices', id);
}

export async function forgetDevice(id) {
  const run = store();
  await run('DEL', devKey(id));
  await run('SREM', 'crumb:devices', id);
}

export async function allDevices() {
  return (await store()('SMEMBERS', 'crumb:devices')) || [];
}

export function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}
