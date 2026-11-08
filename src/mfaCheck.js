// file: src/mfaCheck.js
// Light, no-network check for the daily authenticator code (Nov 2026): "was a code entered on this
// device today?" read straight from the stored sign-in. Kept separate from mfa.js so the start of the app
// doesn't have to load the cloud library just to know. See mfa.js and crumb-mfa-plan.md.
import { isRealSynced, hasSignIn, projectRef } from './syncMode';

// The sign-in as remembered on this device (read directly, so no network is needed to know).
function storedSession() {
  try {
    const raw = localStorage.getItem(`sb-${projectRef()}-auth-token`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function tokenClaims(token) {
  try {
    const part = String(token || '').split('.')[1] || '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const dayOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; // this device's calendar day
};

// When was a code last entered on this device's sign-in? (milliseconds, or 0)
export function lastCodeTime(session = storedSession()) {
  const claims = session && tokenClaims(session.access_token);
  const amr = (claims && Array.isArray(claims.amr) && claims.amr) || [];
  const totp = amr.filter((e) => e && e.method === 'totp').map((e) => Number(e.timestamp) * 1000);
  return totp.length ? Math.max(...totp) : 0;
}

export const codeEnteredToday = (session) => {
  const t = lastCodeTime(session);
  return t > 0 && dayOf(t) === dayOf(Date.now());
};

// Does this device need today's code before showing Crumb? Only devices that sync with an account.
export const needsDailyCode = () => isRealSynced() && hasSignIn() && !codeEnteredToday();
