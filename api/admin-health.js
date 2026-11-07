// GET /api/admin-health  (Authorization: Bearer <the admin's Supabase sign-in token>)
// For Crumb Admin's Platform Health screen: is the reminder system running?
// Only Crumb admins get an answer: the token is checked with Supabase, then the database's own
// is_admin() decides. Returns counts and times only, never reminder text.
import { verifyUser, allDevices, allUsers, loadUser, lastTick } from './_push.js';

const ADMIN_ORIGINS = ['https://crumb-admin.vercel.app'];

async function isAdmin(token) {
  const base = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const res = await fetch(`${base}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return false;
  return (await res.json().catch(() => false)) === true;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ADMIN_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');

  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const uid = await verifyUser(token);
    if (!uid || !(await isAdmin(token))) return res.status(401).json({ error: 'Not allowed' });

    const tick = await lastTick();
    const users = await allUsers();
    let accountDevices = 0;
    for (const id of users) {
      const u = await loadUser(id);
      accountDevices += Object.keys((u && u.devices) || {}).length;
    }
    const oldDevices = (await allDevices()).length;

    res.status(200).json({
      reminders: {
        last_tick_at: tick.at || null,
        last_tick_ok: tick.ok !== false,
        last_tick_sent: tick.sent || 0,
        last_error: tick.ok === false ? String(tick.error || '').slice(0, 200) : '',
        accounts: users.length,
        devices: accountDevices + oldDevices,
      },
    });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err).slice(0, 200) });
  }
}
