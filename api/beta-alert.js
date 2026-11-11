// POST /api/beta-alert  { name, industry, state }
// Right after someone joins the beta on crumbsales.com (website/api/join-beta.js saves it first), the
// website calls this so every Crumb admin's phone gets a push alert, the same way new tickets do.
// The sign-up itself is already saved; this only sends the alert. Anyone could call this address, so it
// sends at most 10 alerts an hour in total and only short plain text.
import { readJsonBody, allUsers, loadUser, sendPush, bump } from './_push.js';

// Tapping it opens Crumb (a notification can't open the separate Admin app on iPhone).
const OPEN_URL = '/';
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if ((await bump('crumb:alert:beta', 3600)) > 10) return res.status(200).json({ ok: true, skipped: 'limit' });

    const { name, industry, state } = readJsonBody(req);
    const who = clip(name, 50) || 'Someone';
    const about = [clip(industry, 40), clip(state, 20)].filter(Boolean).join(' · ');
    const title = 'ADMIN · New beta sign-up';
    const body = `${who}${about ? ` · ${about}` : ''}. Open Crumb Admin → Inbox → Beta.`;

    let sent = 0;
    for (const u of await allUsers()) {
      const user = await loadUser(u);
      if (!user || !user.isAdmin || !user.devices) continue;
      for (const dev of Object.values(user.devices)) {
        if (!dev || !dev.subscription) continue;
        try {
          const r = await sendPush(dev.subscription, { title, body, url: OPEN_URL, tag: `beta-${Date.now()}` });
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
