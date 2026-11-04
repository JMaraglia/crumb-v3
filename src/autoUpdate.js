// file: src/autoUpdate.js
// Home Screen apps on iPhone can stay paused for days on an old copy of Crumb.
// When Crumb opens or comes back to the screen, check whether a newer version was published;
// if so, reload to get it. Never reloads in the middle of editing (Edit / New screens, or while typing).
const SCRIPT_RE = /\/assets\/index-[^"']+\.js/;

function currentScript() {
  const el = [...document.querySelectorAll('script[src]')].find((s) => SCRIPT_RE.test(s.getAttribute('src') || ''));
  const m = el ? (el.getAttribute('src') || '').match(SCRIPT_RE) : null;
  return m ? m[0] : null;
}

function busy() {
  const path = window.location.pathname + window.location.hash;
  if (/\/(edit|new)\b/.test(path)) return true; // unsaved changes could be lost
  const a = document.activeElement;
  return Boolean(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable));
}

let checking = false;
let lastCheck = 0;
async function check() {
  const mine = currentScript();
  if (!mine || checking || Date.now() - lastCheck < 30000) return; // only on the published site; at most every 30s
  checking = true;
  lastCheck = Date.now();
  try {
    const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
    const html = await res.text();
    const m = html.match(SCRIPT_RE);
    if (m && m[0] !== mine && !busy()) {
      // Guard: if a reload for this same version already happened in the last 2 minutes
      // and we're still on the old one (phone cache), don't keep reloading.
      let last = null;
      try {
        last = JSON.parse(sessionStorage.getItem('crumb_update_try') || 'null');
      } catch {
        last = null;
      }
      if (last && last.to === m[0] && Date.now() - last.at < 120000) return;
      try {
        sessionStorage.setItem('crumb_update_try', JSON.stringify({ to: m[0], at: Date.now() }));
      } catch {
        /* not critical */
      }
      window.location.reload();
    }
  } catch {
    /* offline: try again next time */
  } finally {
    checking = false;
  }
}

export function startAutoUpdate() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  setTimeout(check, 3000);
}
