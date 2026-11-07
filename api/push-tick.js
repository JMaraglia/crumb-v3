// GET /api/push-tick?key=CRON_SECRET
// Called every few minutes by cron-job.org (free). Sends any reminders that are now due.
import { allDevices, loadDevice, saveDevice, forgetDevice, sendPush, allUsers, loadUser, saveUser, claimReminder, releaseReminder } from './_push.js';

const LATE_LIMIT = 3 * 3600 * 1000; // skip reminders more than 3 hours late (e.g. after an outage)

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const given = (req.query && req.query.key) || (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!secret || given !== secret) return res.status(401).json({ error: 'Not allowed' });
  const now = Date.now();
  let sent = 0;
  try {
    for (const id of await allDevices()) {
      const device = await loadDevice(id);
      if (!device || !device.subscription) continue;
      const already = new Set(device.sent || []);
      const due = (device.notifications || []).filter((n) => {
        const t = Date.parse(n.at);
        return t && t <= now && now - t < LATE_LIMIT && !already.has(n.id);
      });
      if (!due.length) continue;
      let gone = false;
      for (const n of due.slice(0, 10)) {
        const result = await sendPush(device.subscription, { title: n.title, body: n.body, url: n.url, tag: n.id });
        if (result.gone) {
          gone = true;
          break;
        }
        if (result.ok) {
          already.add(n.id);
          sent += 1;
        }
      }
      if (gone) await forgetDevice(id);
      else {
        // re-read: the phone may have sent a fresh list while these were going out — keep it
        const fresh = (await loadDevice(id)) || device;
        const sentAll = new Set([...(fresh.sent || []), ...already]);
        await saveDevice(id, { ...fresh, sent: Array.from(sentAll).slice(-500) });
      }
    }
    sent += await tickAccounts(now);
    res.status(200).json({ ok: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message, sent });
  }
}

// S8: reminders filed under an account go to each of its devices, once per device (claimed first).
async function tickAccounts(now) {
  let sent = 0;
  for (const uid of await allUsers()) {
    const user = await loadUser(uid);
    if (!user || !user.devices) continue;
    const due = (user.notifications || []).filter((n) => {
      const t = Date.parse(n.at);
      return t && t <= now && now - t < LATE_LIMIT;
    });
    if (!due.length) continue;
    const gone = [];
    for (const [deviceId, dev] of Object.entries(user.devices)) {
      if (!dev || !dev.subscription) continue;
      for (const n of due.slice(0, 10)) {
        if (!(await claimReminder(uid, n.id, deviceId))) continue; // already sent (or being sent) to this device
        let result;
        try {
          result = await sendPush(dev.subscription, { title: n.title, body: n.body, url: n.url, tag: n.id });
        } catch {
          result = { ok: false };
        }
        if (result.gone) {
          gone.push(deviceId);
          break;
        }
        if (result.ok) sent += 1;
        else await releaseReminder(uid, n.id, deviceId); // try again next tick
      }
    }
    if (gone.length) {
      const fresh = (await loadUser(uid)) || user;
      gone.forEach((d) => {
        if (fresh.devices) delete fresh.devices[d]; // that device unsubscribed: forget it
      });
      await saveUser(uid, fresh);
    }
  }
  return sent;
}
