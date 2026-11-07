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

const URL = import.meta.env.VITE_SUPABASE_URL || '';
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const cloudReady = Boolean(URL && KEY);

let client = null;
export function cloud() {
  if (!cloudReady) return null;
  if (!client) {
    client = createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

// Which cloud project this build talks to (shown so a test build is never mistaken for the real one).
export function cloudProjectRef() {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(URL);
  return m ? m[1] : '';
}
