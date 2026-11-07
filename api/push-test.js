// POST /api/push-test { deviceId } → sends a test notification right away
import { loadDevice, sendPush, validDeviceId, readJsonBody, verifyUser, loadUser } from './_push.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { deviceId, token } = readJsonBody(req);
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'Bad device' });
    let device = null;
    if (token) {
      // S8: a device whose reminders are filed under the account
      const uid = await verifyUser(token);
      if (!uid) return res.status(401).json({ error: 'Sign-in expired' });
      const user = await loadUser(uid);
      device = user && user.devices && user.devices[deviceId];
    } else device = await loadDevice(deviceId);
    if (!device || !device.subscription) return res.status(404).json({ error: 'Not signed up yet' });
    const result = await sendPush(device.subscription, {
      title: 'Crumb notifications are on ✅',
      body: "You'll get your morning summary and visit reminders here.",
      url: '/',
      tag: 'crumb-test',
    });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
