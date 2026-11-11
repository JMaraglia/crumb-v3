// POST /api/admin-nudge  { email, message }   (Authorization: Bearer <the admin's Supabase sign-in token>)
// Crumb Admin → Users → Send A Nudge (founder, Nov 11): a push notification to ONE rep's devices, e.g. a
// friendly "come back" note for someone who's gone quiet. Admins only. It reaches only devices where that rep
// turned Crumb's notifications on. Limits: 30 nudges an hour in total, one per rep every 10 minutes.
// The rep is found by email through the database's admin-only admin_user_id() (0016), with the admin's own token.
import { verifyUser, isAdminToken, readJsonBody, bump, loadUser, sendPush } from './_push.js';

const ADMIN_ORIGINS = ['https://crumb-admin.vercel.app'];
const PER_HOUR = 30;
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

async function userIdFor(token, email) {
  const base = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) return { error: 'missing settings' };
  const res = await fetch(`${base}/rest/v1/rpc/admin_user_id`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_email: email }),
  });
  if (res.status === 404) return { missing: true };
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: (data && data.message) || `status ${res.status}` };
  return { id: typeof data === 'string' && /^[0-9a-f-]{36}$/.test(data) ? data : null };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ADMIN_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const body = readJsonBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const message = clip(body.message, 160);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'That doesn’t look like an email address.' });
  if (!message) return res.status(400).json({ error: 'Type a message first.' });

  try {
    const uid = await verifyUser(token);
    if (!uid || (await isAdminToken(token)) !== true) return res.status(401).json({ error: 'Not allowed' });

    const who = await userIdFor(token, email);
    if (who.missing) return res.status(503).json({ error: 'Not turned on yet: the nudge SQL (0016) hasn’t been run in Supabase.' });
    if (who.error) return res.status(502).json({ error: 'Couldn’t look that person up. Try again.' });
    if (!who.id) return res.status(404).json({ error: 'No account with that email.' });

    const user = await loadUser(who.id);
    const devices = user && user.devices ? Object.values(user.devices).filter((d) => d && d.subscription) : [];
    if (!devices.length) return res.status(200).json({ ok: true, sent: 0, devices: 0 });

    if ((await bump(`crumb:nudge:${who.id}`, 600)) > 1) return res.status(429).json({ error: 'You just nudged this person. Wait 10 minutes.' });
    if ((await bump('crumb:nudge', 3600)) > PER_HOUR) return res.status(429).json({ error: `Limit reached: ${PER_HOUR} nudges an hour. Try again later.` });

    let sent = 0;
    for (const dev of devices) {
      try {
        const r = await sendPush(dev.subscription, { title: 'Crumb', body: message, url: '/', tag: `nudge-${Date.now()}` });
        if (r.ok) sent += 1;
      } catch {
        /* one device failing never stops the others */
      }
    }
    return res.status(200).json({ ok: true, sent, devices: devices.length });
  } catch {
    return res.status(502).json({ error: 'Something went wrong sending the nudge. Try again.' });
  }
}
