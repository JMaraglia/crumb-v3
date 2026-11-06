// POST /api/push-sync  { deviceId, subscription?, notifications: [{ id, at, title, body, url }] }
// The phone sends its upcoming reminders (next 7 days). Nothing else from Crumb is sent.
import { loadDevice, saveDevice, validDeviceId, readJsonBody, forgetDevice } from './_push.js';

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { deviceId, subscription, notifications, off } = readJsonBody(req);
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'Bad device' });
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
