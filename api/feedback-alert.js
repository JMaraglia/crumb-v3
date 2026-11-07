// POST /api/feedback-alert  (Authorization: Bearer <the sender's Supabase sign-in token>)
// Body: { id, kind: 'problem' | 'suggestion', area, message }
// Right after a rep sends Report A Problem / Make A Suggestion, Crumb calls this so every Crumb admin's
// phone gets a push alert. Only signed-in people can trigger it, at most 5 an hour each.
// The ticket itself is already saved in the database; this only sends the alert.
import { verifyUser, readJsonBody, allUsers, loadUser, sendPush, bump } from './_push.js';

// Tapping it opens Crumb (a notification can't open the separate Admin app on iPhone).
const OPEN_URL = '/';
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const uid = await verifyUser(token);
    if (!uid) return res.status(401).json({ error: 'Not signed in' });
    if ((await bump(`crumb:alert:${uid}`, 3600)) > 5) return res.status(200).json({ ok: true, skipped: 'limit' });

    const { id, kind, area, message } = readJsonBody(req);
    const isProblem = kind !== 'suggestion';
    const num = Number.isInteger(Number(id)) && Number(id) > 0 ? ` #${Number(id)}` : '';
    const title = `${isProblem ? 'New ticket' : 'New suggestion'}${num}${area ? ` · ${clip(area, 30)}` : ''}`;
    const body = clip(message, 140) || 'Open Crumb Admin to read it.';

    let sent = 0;
    for (const u of await allUsers()) {
      const user = await loadUser(u);
      if (!user || !user.isAdmin || !user.devices) continue;
      for (const dev of Object.values(user.devices)) {
        if (!dev || !dev.subscription) continue;
        try {
          const r = await sendPush(dev.subscription, { title, body, url: OPEN_URL, tag: `fb-${num || Date.now()}` });
          if (r.ok) sent += 1;
        } catch {
          /* one phone failing never stops the others */
        }
      }
    }
    res.status(200).json({ ok: true, sent });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err).slice(0, 200) });
  }
}
