// POST /api/admin-invite-email  { email, name?, resend? }   (Authorization: Bearer <the admin's Supabase sign-in token>)
// Crumb Admin: sends the beta welcome email after the founder approves someone.
// Nov 10: every send is recorded in the database (0012_welcome_sent.sql). Approving sends only if this
// address never got one; resend: true (Resend Welcome Email, confirmed) sends again. Replies
// { ok, sent: true, times } or { ok, skipped: true, reason: 'already_sent' | 'sending', sent_at, times }.
// Safeguards:
//   - only Crumb admins (the token is checked with Supabase, then the database's own is_admin()),
//   - only to an email that is already on the Sync Access list (asked with the admin's own token),
//   - at most 20 emails an hour across all admins.
// Sent through Resend (RESEND_API_KEY in this Vercel project's settings, never in code or chat)
// from Crumb <no-reply@crumbsales.com>. Optional settings: INVITE_REPLY_TO (where replies go), SITE_URL.
import { verifyUser, isAdminToken, readJsonBody, bump } from './_push.js';

const ADMIN_ORIGINS = ['https://crumb-admin.vercel.app'];
const FROM = 'Crumb <no-reply@crumbsales.com>';
const PER_HOUR = 20;

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function firstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return /^[\p{L}][\p{L}'.-]{0,30}$/u.test(first) ? first : '';
}

// Is this email on the Sync Access list? Asked with the admin's own token (no secret key).
async function onSyncList(token, email) {
  const base = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) return null;
  const res = await fetch(`${base}/rest/v1/rpc/admin_sync_invites_list`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows)) return null;
  return rows.find((r) => String(r.email || '').toLowerCase() === email) || false;
}

// Ask the database (with the admin's own token) whether to send, and record the result.
async function rpc(token, name, args) {
  const base = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) return { error: 'missing settings' };
  const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: (data && data.message) || `status ${res.status}` };
  return { data };
}

// Founder's final copy (Nov 10, 2026). Greeting is "Welcome!" (no names); signed "The Crumb Team".
// Nov 10 (step 3): only approved emails can create an account, so there's no "already have an account" version.
export function welcomeEmail({ siteUrl = 'https://crumbsales.com' } = {}) {
  const subject = 'You’re In. Welcome To The Crumb Beta.';
  const steps = [
    ['Go to <a href="SITE" style="color:#0077cc;font-weight:bold;">CrumbSales.com</a> and tap <b>Sign In</b>.', 'Go to CrumbSales.com (SITE) and tap Sign In.'],
    ['At the bottom of the sign-in page, tap <b>Create Account</b>.', 'At the bottom of the sign-in page, tap Create Account.'],
    ['Use the same email address that received this invitation and create a password.', 'Use the same email address that received this invitation and create a password.'],
  ];
  const site = siteUrl.replace(/\/+$/, '');
  const text = [
    'Welcome!',
    '',
    'You’re approved for the Crumb beta. Built for outside sales reps, Crumb keeps your customers, daily stops, notes and follow-ups together on your phone.',
    '',
    'Get Set Up:',
    ...steps.map(([, t], i) => `${i + 1}. ${t.replace('SITE', site)}`),
    '',
    'Crumb works on desktop, but it’s built for your day in the field and works best on your phone. Add it to your home screen for easy access:',
    '- iPhone: Open Crumb in Safari, tap Share → Add To Home Screen.',
    '- Android: Open Crumb in Chrome, tap the three-dot menu → Add To Home Screen or Install App.',
    '',
    'Found A Bug Or Have A Cool Idea?',
    'Go to Settings → Report A Problem or Make A Suggestion. For problems, tell us what you were doing and what happened.',
    '',
    'You’re getting early access, so expect a few rough edges. Your feedback will help shape Crumb.',
    'Thanks for being part of it.',
    '',
    'The Crumb Team',
  ].join('\n');
  const p = (body, extra = '') => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#444444;${extra}">${body}</p>`;
  const h = (body) => `<p style="margin:0 0 10px;font-size:17px;font-weight:bold;color:#222222;">${body}</p>`;
  const row = (n, body) =>
    `<tr><td valign="top" style="padding:0 12px 10px 0;font-size:16px;line-height:1.5;font-weight:bold;color:#0077cc;">${n}</td><td style="padding:0 0 10px;font-size:16px;line-height:1.5;color:#444444;">${body}</td></tr>`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f2f4f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4f7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td align="center" style="padding:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:44px;font-weight:bold;color:#0077cc;letter-spacing:-1px;">Crumb.</td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:16px;padding:32px 28px;font-family:Helvetica,Arial,sans-serif;color:#222222;">
            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#222222;">Welcome!</h1>
            ${p('You&rsquo;re approved for the Crumb beta. Built for outside sales reps, Crumb keeps your customers, daily stops, notes and follow-ups together on your phone.', 'margin-bottom:24px;')}
            ${h('Get Set Up:')}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;margin:0 0 14px;">
              ${steps.map(([b], i) => row(`${i + 1}.`, b.replace('SITE', esc(site)))).join('\n              ')}
            </table>
            ${p('Crumb works on desktop, but it&rsquo;s built for your day in the field and works best on your phone. Add it to your home screen for easy access:', 'margin-bottom:10px;')}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;margin:0 0 24px;">
              ${row('&bull;', '<b>iPhone:</b> Open Crumb in Safari, tap Share &rarr; Add To Home Screen.')}
              ${row('&bull;', '<b>Android:</b> Open Crumb in Chrome, tap the three-dot menu &rarr; Add To Home Screen or Install App.')}
            </table>
            ${h('Found A Bug Or Have A Cool Idea?')}
            ${p('Go to Settings &rarr; Report A Problem or Make A Suggestion. For problems, tell us what you were doing and what happened.', 'margin-bottom:24px;')}
            ${p('You&rsquo;re getting early access, so expect a few rough edges. Your feedback will help shape Crumb.', 'margin-bottom:8px;')}
            ${p('Thanks for being part of it.', 'margin-bottom:24px;')}
            <p style="margin:0;font-size:16px;font-weight:bold;color:#222222;">The Crumb Team</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 12px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8a8a8e;">You&rsquo;re getting this because you were approved for the Crumb beta.<br>Crumb &middot; Taking every last Crumb.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
  return { subject, text, html };
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

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Welcome emails aren’t turned on yet (RESEND_API_KEY isn’t set in Vercel).' });

  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const body = readJsonBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const resend = body.resend === true;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'That doesn’t look like an email address.' });

  try {
    const uid = await verifyUser(token);
    if (!uid || (await isAdminToken(token)) !== true) return res.status(401).json({ error: 'Not allowed' });

    const row = await onSyncList(token, email);
    if (row === null) return res.status(502).json({ error: 'Couldn’t check the Sync Access list. Try again.' });
    if (!row) return res.status(400).json({ error: 'Only approved emails can get the welcome email. Approve them first.' });

    if ((await bump('crumb:invite-mail', 3600)) > PER_HOUR) {
      return res.status(429).json({ error: `Limit reached: ${PER_HOUR} welcome emails an hour. Try again later.` });
    }

    // Approving never sends twice; Resend (confirmed in Admin) does. Blocks double taps too.
    const claim = await rpc(token, 'admin_welcome_claim', { p_email: email, p_resend: resend });
    if (claim.error) return res.status(502).json({ error: `Couldn’t check whether a welcome email already went out (${String(claim.error).slice(0, 120)}).` });
    if (!claim.data || claim.data.send !== true) {
      return res.status(200).json({ ok: true, skipped: true, email, reason: (claim.data && claim.data.reason) || 'already_sent', sent_at: claim.data && claim.data.sent_at, times: (claim.data && claim.data.times) || 0 });
    }

    const siteUrl = String(process.env.SITE_URL || 'https://crumbsales.com').trim();
    const { subject, text, html } = welcomeEmail({ siteUrl });
    const replyTo = String(process.env.INVITE_REPLY_TO || '').trim();
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!sent.ok) {
      const err = await sent.json().catch(() => ({}));
      await rpc(token, 'admin_welcome_done', { p_email: email, p_ok: false, p_resend: resend });
      return res.status(502).json({ error: `The email service said no: ${String(err.message || sent.status).slice(0, 160)}` });
    }
    const done = await rpc(token, 'admin_welcome_done', { p_email: email, p_ok: true, p_resend: resend });
    return res.status(200).json({ ok: true, sent: true, email, times: (done.data && done.data.times) || 1 });
  } catch {
    return res.status(502).json({ error: 'Something went wrong sending the email. Try again.' });
  }
}
