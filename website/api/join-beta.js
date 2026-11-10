// POST /api/join-beta  { name, email, industry, state, company, website }
// The Join The Beta form on crumbsales.com. Saves the sign-up in Crumb's database (join_beta), where it
// shows up in Crumb Admin → Inbox → Beta. "website" is a hidden trap field: real people never fill it in.
// The database address and its public key come from this Vercel project's settings, never from the code.

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Spam trap: pretend it worked, save nothing.
  if (clip(body.website, 200)) return res.status(200).json({ ok: true });

  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!base || !key) return res.status(500).json({ error: 'The sign-up form isn’t connected yet. Please try again later.' });

  if (clip(body.name, 100).split(/\s+/).length < 2) return res.status(400).json({ error: 'Please enter your first and last name.' });
  if (!clip(body.industry, 60)) return res.status(400).json({ error: 'Please enter your industry.' });
  if (!clip(body.state, 40)) return res.status(400).json({ error: 'Please pick your state.' });

  try {
    const call = (args) =>
      fetch(`${base}/rest/v1/rpc/join_beta`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    const basic = { p_name: clip(body.name, 100), p_email: clip(body.email, 200), p_company: clip(body.company, 120) };
    let r = await call({ ...basic, p_industry: clip(body.industry, 60), p_state: clip(body.state, 40) });
    // Before 0011_beta_industry.sql is run, the database only knows the old 3-field version: still save the sign-up.
    if (!r.ok && r.status === 404) r = await call(basic);
    if (r.ok) return res.status(200).json({ ok: true });
    const err = await r.json().catch(() => ({}));
    const msg = String(err.message || '');
    // Only the database's own plain-English messages are passed on.
    if (/Please enter|Please pick|Too many sign-ups/.test(msg)) return res.status(400).json({ error: msg });
    return res.status(502).json({ error: 'Something went wrong. Please try again.' });
  } catch {
    return res.status(502).json({ error: 'Something went wrong. Please try again.' });
  }
}
