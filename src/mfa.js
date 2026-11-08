// file: src/mfa.js
// Daily authenticator code (MFA), Nov 2026. See the project doc crumb-mfa-plan.md.
// Every device that syncs with a Crumb account enters a 6-digit code from the person's authenticator app
// once per calendar day. Uses Supabase's own MFA: the time the code was entered is stored INSIDE the
// sign-in (its "amr" record), so the same fact can also be checked by the database itself (enforcement
// comes in a later step).
// This file never touches customers, notes, photos, the outbox or reminders.
import { cloud } from './cloud';
export { lastCodeTime, codeEnteredToday, needsDailyCode } from './mfaCheck';

// ---------- Supabase MFA (authenticator app / TOTP) ----------

// The person's verified authenticators (needs signal).
export async function verifiedAuthenticators() {
  const { data, error } = await cloud().auth.mfa.listFactors();
  if (error) throw error;
  return (data && data.totp) || [];
}

// Start setting up a new authenticator: returns { factorId, qr, secret, uri }.
// Any half-finished setup from before is removed first (it was never verified, so nothing is lost).
export async function startSetup() {
  const sb = cloud();
  const { data: list, error: listErr } = await sb.auth.mfa.listFactors();
  if (listErr) throw listErr;
  for (const f of (list && list.all) || []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      await sb.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Crumb ${stamp}`, issuer: 'Crumb' });
  if (error) throw error;
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

// Check a 6-digit code against one authenticator (setup) or any of the person's authenticators (daily).
export async function verifyCode(code, factorIds) {
  const sb = cloud();
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) throw new Error('Enter the 6-digit code.');
  let lastErr = null;
  for (const factorId of factorIds) {
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: clean });
    if (!error) return true;
    lastErr = error;
  }
  throw lastErr || new Error('That code didn’t work.');
}

// Plain-English MFA errors.
export function mfaError(err) {
  const msg = String((err && (err.message || err.error_description)) || err || '');
  if (/load failed|failed to fetch|network/i.test(msg)) return 'No signal. Connect to Wi-Fi or cell signal to enter today’s code.';
  if (/invalid totp|invalid code|mfa_verification_failed|expired|incorrect/i.test(msg)) return 'That code didn’t work. Codes change every 30 seconds; enter the one showing now.';
  if (/too many|rate limit|429/i.test(msg)) return 'Too many tries. Wait a minute, then try again.';
  if (/disabled/i.test(msg)) return 'Authenticator codes are turned off for this Crumb account. Tell the Crumb team.';
  return msg || 'Something went wrong. Try again.';
}
