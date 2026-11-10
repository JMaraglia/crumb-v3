// file: src/autoUpdate.js
// Home Screen apps on iPhone can stay on an old copy of Crumb for days.
// Crumb checks whether a newer version was published:
//   - when it opens or comes back to the screen,
//   - and every few minutes while it stays open.
// If there is one, it reloads to get it, but only when nothing could be lost: never on Edit / New
// screens, setup, sign-in, backup or feedback; never while typing, while a panel (sheet) is open,
// while a text box still holds typed text, or within a few seconds of touching the screen.
// If it's not safe yet, the update waits and goes through as soon as it is (checked every few seconds).
const SCRIPT_RE = /\/assets\/index-[^"']+\.js/;
const CHECK_EVERY = 3 * 60 * 1000; // while open on screen
const MIN_GAP = 30 * 1000; // never ask the server more often than this
const QUIET_AFTER_TOUCH = 8 * 1000; // don't reload right under a finger (dragging, swiping, scrolling)
const TICK = 5 * 1000;

// Screens where a reload could lose work, whatever is on them.
const BUSY_PATHS = /\/(edit|new)\b|^\/(setup|sign-in|backup|feedback|cloud-test|access)\b/;
// Text boxes that count as "something typed" (dates, times, checkboxes, etc. don't).
const TEXT_BOXES = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="password"]';
// Any open panel: every sheet / backdrop / modal in Crumb has one of these in its class name.
// (Wrap Up Today's page uses a sheet class for its layout but isn't a panel.)
const OPEN_PANEL = '[class*="sheet"]:not(.it-wrap-sheet), [class*="backdrop"], [class*="modal"], [class*="overlay"]';

export function currentScript() {
  const el = [...document.querySelectorAll('script[src]')].find((s) => SCRIPT_RE.test(s.getAttribute('src') || ''));
  const m = el ? (el.getAttribute('src') || '').match(SCRIPT_RE) : null;
  return m ? m[0] : null;
}

let lastTouch = 0;

export function busy(now = Date.now()) {
  if (BUSY_PATHS.test(window.location.pathname)) return true;
  if (now - lastTouch < QUIET_AFTER_TOUCH) return true;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return true;
  if (document.querySelector(OPEN_PANEL)) return true;
  return [...document.querySelectorAll(TEXT_BOXES)].some((el) => String(el.value || '').trim() !== '');
}

let checking = false;
let lastCheck = 0;
let pending = null; // newer version found, waiting until it's safe to reload

function reloadTo(to) {
  // Guard: if a reload for this same version already happened in the last 2 minutes
  // and we're still on the old one (phone cache), don't keep reloading.
  let last = null;
  try {
    last = JSON.parse(sessionStorage.getItem('crumb_update_try') || 'null');
  } catch {
    last = null;
  }
  if (last && last.to === to && Date.now() - last.at < 120000) return;
  try {
    sessionStorage.setItem('crumb_update_try', JSON.stringify({ to, at: Date.now() }));
  } catch {
    /* not critical */
  }
  window.location.reload();
}

function tryPending() {
  if (pending && document.visibilityState === 'visible' && !busy()) reloadTo(pending);
}

async function check() {
  const mine = currentScript();
  if (!mine || checking || Date.now() - lastCheck < MIN_GAP) return; // only on the published site
  checking = true;
  lastCheck = Date.now();
  try {
    const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
    const html = await res.text();
    const m = html.match(SCRIPT_RE);
    if (m && m[0] !== mine) {
      pending = m[0];
      tryPending();
    }
  } catch {
    /* offline: try again next time */
  } finally {
    checking = false;
  }
}

export function startAutoUpdate() {
  const touched = () => {
    lastTouch = Date.now();
  };
  ['pointerdown', 'touchstart', 'touchmove', 'keydown', 'wheel'].forEach((t) =>
    window.addEventListener(t, touched, { passive: true, capture: true })
  );
  window.addEventListener('scroll', touched, { passive: true, capture: true });

  const onShow = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', onShow);
  window.addEventListener('focus', onShow);
  window.addEventListener('pageshow', onShow); // iPhone sometimes resumes a Home Screen app this way

  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (pending) tryPending();
    else if (Date.now() - lastCheck >= CHECK_EVERY) check();
  }, TICK);

  setTimeout(check, 3000);
}
