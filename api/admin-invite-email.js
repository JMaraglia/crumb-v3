// POST /api/admin-invite-email  { email, name? }   (Authorization: Bearer <the admin's Supabase sign-in token>)
// Crumb Admin: sends the beta welcome email after the founder approves someone.
// Safeguards:
//   - only Crumb admins (the token is checked with Supabase, then the database's own is_admin()),
//   - only to an email that is already on the Sync Access list (asked with the admin's own token),
//   - at most 20 emails an hour across all admins.
// Sent through Resend (RESEND_API_KEY in this Vercel project's settings, never in code or chat)
// from Crumb <no-reply@crumbsales.com>. Optional settings: INVITE_REPLY_TO (where replies go), CRM_URL.
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

export function welcomeEmail({ name, hasAccount, appUrl }) {
  const hi = firstName(name) || 'there';
  const link = `${appUrl}/sign-in`;
  const signInLine = hasAccount
    ? 'Sign in with this email and the password you already made.'
    : 'Sign in with this email. First time? Tap Create Account.';
  const subject = 'You’re In. Welcome To The Crumb Beta.';
  const text = [
    `Hey ${hi},`,
    '',
    'You’re approved for the Crumb beta. Crumb is the CRM built for outside sales reps: your customers, your route and your follow-ups, on the phone in your pocket.',
    '',
    'Get set up (2 minutes):',
    `1. On your iPhone, open Crumb in Safari: ${link}`,
    `2. ${signInLine}`,
    '3. Tap Share → Add To Home Screen so Crumb opens like an app.',
    '',
    'Something broken or got an idea? In Crumb, go to Settings → Report A Problem or Make A Suggestion. Tell us what you were doing and what happened. A screenshot helps.',
    '',
    'Crumb. Team',
  ].join('\n');
  const step = (n, body) =>
    `<tr><td valign="top" style="padding:0 12px 12px 0;font-size:16px;font-weight:bold;color:#0077cc;">${n}.</td><td style="padding:0 0 12px;font-size:16px;line-height:1.5;color:#444444;">${body}</td></tr>`;
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
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#222222;">You&rsquo;re In.</h1>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#444444;">Hey ${esc(hi)},</p>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#444444;">You&rsquo;re approved for the Crumb beta. Crumb is the CRM built for outside sales reps: your customers, your route and your follow-ups, on the phone in your pocket.</p>
            <p style="margin:0 0 12px;font-size:16px;font-weight:bold;color:#222222;">Get set up (2 minutes):</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;">
              ${step(1, 'On your iPhone, open Crumb in Safari.')}
              ${step(2, esc(signInLine))}
              ${step(3, 'Tap Share &rarr; Add To Home Screen so Crumb opens like an app.')}
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 24px;">
              <tr>
                <td align="center" style="border-radius:12px;background:#0077cc;">
                  <a href="${esc(link)}" style="display:block;padding:16px 20px;font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;">Open Crumb</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#444444;"><b>Something broken or got an idea?</b> In Crumb, go to Settings &rarr; Report A Problem or Make A Suggestion. Tell us what you were doing and what happened. A screenshot helps.</p>
            <p style="margin:0;font-size:16px;font-weight:bold;color:#222222;">Crumb. Team</p>
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

    const appUrl = String(process.env.CRM_URL || 'https://crumb-v3.vercel.app').trim().replace(/\/+$/, '');
    const { subject, text, html } = welcomeEmail({ name: body.name, hasAccount: Boolean(row.has_account), appUrl });
    const replyTo = String(process.env.INVITE_REPLY_TO || '').trim();
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!sent.ok) {
      const err = await sent.json().catch(() => ({}));
      return res.status(502).json({ error: `The email service said no: ${String(err.message || sent.status).slice(0, 160)}` });
    }
    return res.status(200).json({ ok: true, email });
  } catch {
    return res.status(502).json({ error: 'Something went wrong sending the email. Try again.' });
  }
}
