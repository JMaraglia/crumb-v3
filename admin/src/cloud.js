// Crumb Admin's connection to the same Supabase project as the Crumb CRM.
// The address and publishable key come from this app's own Vercel settings
// (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY). The publishable key is designed to be public:
// what an admin may see is decided by the database (public.admins + admin_* functions), not by this app.
// No secret key is used anywhere in Crumb Admin.
import { createClient } from '@supabase/supabase-js';

const URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const cloudReady = Boolean(URL && KEY);
export const projectRef = (URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1] || '';

let client = null;
export let cloudProblem = '';

export function cloud() {
  if (!cloudReady) return null;
  if (!client && !cloudProblem) {
    try {
      client = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    } catch (err) {
      cloudProblem = String((err && err.message) || err || 'The cloud settings look wrong.');
    }
  }
  return client;
}

// Plain-English errors.
export function plainError(err) {
  const msg = String((err && (err.message || err.error_description)) || err || '');
  if (/load failed|failed to fetch|network/i.test(msg)) return "Couldn't reach the cloud. Check your connection and try again.";
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return "This email hasn't been confirmed yet.";
  if (/not allowed|permission denied|42501/i.test(msg)) return "This account isn't a Crumb admin.";
  return msg || 'Something went wrong.';
}

// Sign out of THIS device only. Other devices (and the Crumb app) stay signed in.
// Ends this device's sign-in on the server, then always clears it here too, even with no signal.
export async function signOutThisDevice() {
  const sb = cloud();
  try {
    if (sb) await sb.auth.signOut({ scope: 'local' });
  } catch {
    /* no signal: cleared on this device below */
  }
  try {
    for (const k of Object.keys(localStorage)) {
      if (projectRef && k.startsWith(`sb-${projectRef}-auth-token`)) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}
