// file: src/cloud.js
// The connection to Crumb's cloud database (Supabase). TEST STAGE ONLY (Nov 2026):
// used by the Cloud Test screen to sign in and prove the connection works. It does NOT move,
// sync or change any of the data saved on this phone.
//
// The project address and its publishable key come from Vercel settings (VITE_SUPABASE_URL,
// VITE_SUPABASE_PUBLISHABLE_KEY) — never written in the code. The publishable key is designed to be
// public; the database's security rules decide what anyone can see.
// The sign-in itself is remembered by the Supabase library on this device (its own "sb-…" item,
// which is not part of Crumb backups).
import { createClient } from '@supabase/supabase-js';

const URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, ''); // a stray trailing "/" is ignored
const KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const cloudReady = Boolean(URL && KEY);

let client = null;
// If the address or key in Vercel is wrong, the cloud library refuses to start. Then Crumb shows what's
// wrong (cloudProblem) instead of breaking the screen, and nothing syncs.
export let cloudProblem = '';
export function cloud() {
  if (!cloudReady) return null;
  if (!client && !cloudProblem) {
    try {
      client = createClient(URL, KEY, {
        // 'implicit': email links (confirm, reset password) work even when they open in Safari instead of
        // the Home Screen app (the other flow only works in the same browser that asked for the email).
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      });
    } catch (err) {
      cloudProblem = String((err && err.message) || err || 'The cloud settings in this version look wrong.');
      client = null;
    }
  }
  return client;
}

// Which cloud project this build talks to (shown so a test build is never mistaken for the real one).
export function cloudProjectRef() {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(URL);
  return m ? m[1] : '';
}

// Sign out of THIS device only (Nov 2026). Other phones and iPads stay signed in.
// Ends this device's sign-in on the server ("this device only"), then always clears it here too,
// even with no signal, so the next sign-in needs the email, password (and later, the daily code) again.
// Nothing else is touched: customers, notes, photos and unsent changes stay on the phone.
export async function signOutThisDevice() {
  const sb = cloud();
  try {
    if (sb) await sb.auth.signOut({ scope: 'local' });
  } catch {
    /* no signal: cleared on this device below */
  }
  const ref = cloudProjectRef();
  try {
    for (const k of Object.keys(localStorage)) {
      if (ref && k.startsWith(`sb-${ref}-auth-token`)) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
