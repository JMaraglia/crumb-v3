// POST /api/push-sync  { deviceId, subscription?, notifications: [{ id, at, title, body, url }], token? }
// The phone sends its upcoming reminders (next 7 days). Nothing else from Crumb is sent.
// With `token` (a signed-in device that syncs your data, S8): the list is filed under your ACCOUNT, and
// this device is one of the devices that get your reminders (each reminder once per device).
import { loadDevice, saveDevice, validDeviceId, readJsonBody, forgetDevice, verifyUser, loadUser, saveUser, isAdminToken } from './_push.js';

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { deviceId, subscription, notifications, off, token } = readJsonBody(req);
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'Bad device' });
    if (token) return await accountSync(res, { deviceId, subscription, notifications, off, token });
    if (off) {
      await forgetDevice(deviceId); // notifications turned off: forget this phone
      return res.status(200).json({ ok: true, off: true });
    }
    const existing = (await loadDevice(deviceId)) || {};
    const sub = subscription && subscription.endpoint && subscription.keys ? subscription : existing.subscription;
    if (!sub || !/^https:\/\//.test(sub.endpoint)) return res.status(400).json({ error: 'Not signed up for notifications' });
    const list = (Array.isArray(notifications) ? notifications : []).slice(0, 300).map((n) => ({
      id: clip(n.id, 120),
      at: clip(n.at, 40),
      title: clip(n.title, 120),
      body: clip(n.body, 1500), // morning rundown lists every stop
      url: clip(n.url, 100) || '/',
    }));
    // A reminder that came due in the last 30 min but hasn't gone out yet (the 5-minute timer hasn't
    // run) stays on the list, so a sync right after 4:00 can't wipe the 4:00 reminder.
    const sentSet = new Set(existing.sent || []);
    const now = Date.now();
    const ids = new Set(list.map((n) => n.id));
    const pending = (existing.notifications || []).filter((n) => {
      const t = Date.parse(n.at);
      return t && t <= now && now - t < 30 * 60 * 1000 && !sentSet.has(n.id) && !ids.has(n.id);
    });
    await saveDevice(deviceId, {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: clip(sub.keys.p256dh, 200), auth: clip(sub.keys.auth, 100) } },
      notifications: [...pending, ...list],
      sent: (existing.sent || []).slice(-500),
      syncedAt: new Date().toISOString(),
    });
    res.status(200).json({ ok: true, count: list.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

const cleanList = (notifications) =>
  (Array.isArray(notifications) ? notifications : []).slice(0, 300).map((n) => ({
    id: clip(n.id, 120),
    at: clip(n.at, 40),
    title: clip(n.title, 120),
    body: clip(n.body, 1500),
    url: clip(n.url, 100) || '/',
  }));

// S8: reminders filed under the signed-in account
async function accountSync(res, { deviceId, subscription, notifications, off, token }) {
  const uid = await verifyUser(token);
  if (!uid) return res.status(401).json({ error: 'Sign-in expired' });
  await forgetDevice(deviceId).catch(() => {}); // this phone no longer gets its own (old-style) reminders
  const user = (await loadUser(uid)) || { devices: {}, notifications: [] };
  user.devices = user.devices || {};
  if (off) {
    delete user.devices[deviceId]; // notifications turned off on this device only
    await saveUser(uid, user);
    return res.status(200).json({ ok: true, off: true });
  }
  const prev = user.devices[deviceId] && user.devices[deviceId].subscription;
  const sub = subscription && subscription.endpoint && subscription.keys ? subscription : prev;
  if (!sub || !/^https:\/\//.test(sub.endpoint)) return res.status(400).json({ error: 'Not signed up for notifications' });
  user.devices[deviceId] = {
    subscription: { endpoint: sub.endpoint, keys: { p256dh: clip(sub.keys.p256dh, 200), auth: clip(sub.keys.auth, 100) } },
    at: new Date().toISOString(),
  };
  // One list per account: the newest one sent. Reminders that came due in the last 30 min and haven't
  // gone out yet stay, so a sync right at 4:00 can't wipe the 4:00 reminder (sending claims prevent repeats).
  const list = cleanList(notifications);
  const ids = new Set(list.map((n) => n.id));
  const now = Date.now();
  const recent = (user.notifications || []).filter((n) => {
    const t = Date.parse(n.at);
    return t && t <= now && now - t < 30 * 60 * 1000 && !ids.has(n.id);
  });
  user.notifications = [...recent, ...list];
  user.syncedAt = new Date().toISOString();
  user.from = deviceId;
  user.isAdmin = await isAdminToken(token); // Crumb admins also get "new ticket" alerts on these devices
  await saveUser(uid, user);
  return res.status(200).json({ ok: true, count: list.length, account: true });
}
