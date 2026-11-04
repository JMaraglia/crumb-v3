// GET /api/push-tick?key=CRON_SECRET
// Called every few minutes by cron-job.org (free). Sends any reminders that are now due.
import { allDevices, loadDevice, saveDevice, forgetDevice, sendPush } from './_push.js';

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
      else await saveDevice(id, { ...device, sent: Array.from(already).slice(-500) });
    }
    res.status(200).json({ ok: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message, sent });
  }
}
