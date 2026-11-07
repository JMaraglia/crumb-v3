// file: src/notify.js
// Push notifications for Crumb (morning summary + reminders before visits and appointments).
// The phone works out its next 7 days of reminders and sends ONLY that list to Crumb's server
// (/api/push-sync); the server sends each one when it's due. Customer lists and notes stay here.
import {
  keyOf,
  addDaysToKey,
  fromKey,
  readJSON,
  toVisitList,
  hhmmToMinutes,
  onItinerary,
  visitTimeOn,
  PROSPECT_DAYS_FIELD,
  CUSTOMER_DAYS_FIELD,
  hiddenByInactive,
  dayTimeOf,
} from './schedule';
import { noteCat, isNoteDone } from './noteStatus';
import { staleAccounts, staleDays } from './lastContact';

const SETTINGS_KEY = 'crumb_notify_settings';
const DEVICE_KEY = 'crumb_push_device';
const DAYS_AHEAD = 7;

export const DEFAULT_NOTIFY = {
  enabled: false,
  morning: true,       // morning summary
  morningTime: 420,    // minutes from midnight (7:00 AM)
  lead: 30,            // minutes before visits / appointments (0 = off)
  afternoon: true,     // end-of-day reminder: what's still open
  afternoonTime: 960,  // 4:00 PM
  afternoonInclude: { tasks: true, followups: true, samples: true, stops: false }, // what it lists
  leadInclude: { appointments: true, stops: false }, // reminders before: calendar appointments / Itinerary stops
};

export const END_OF_DAY_KINDS = [
  ['tasks', 'Tasks'],
  ['followups', 'Follow-ups'],
  ['samples', 'Samples'],
  ['stops', 'Itinerary stops not checked off'],
];

export function loadNotifySettings() {
  return { ...DEFAULT_NOTIFY, ...readJSON(SETTINGS_KEY, {}) };
}

export function saveNotifySettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* not critical */
  }
}

function deviceId() {
  let id = '';
  try {
    id = localStorage.getItem(DEVICE_KEY) || '';
  } catch {
    /* ignore */
  }
  if (!/^[a-f0-9]{32}$/.test(id)) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      /* ignore */
    }
  }
  return id;
}

export function pushSupport() {
  const standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { supported, standalone, permission: 'Notification' in window ? Notification.permission : 'unsupported' };
}

const timeText = (m) => {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const at = (dayKey, minutes) => {
  const d = fromKey(dayKey);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).toISOString();
};
const hasName = (a) => a && a.name && String(a.name).trim();

// Everything Crumb should remind you about over the next 7 days.
export function buildReminders(settings = loadNotifySettings(), now = new Date()) {
  const contacts = readJSON('crumb_contacts', []) || [];
  const prospects = readJSON('crumb_prospects', []) || [];
  const events = toVisitList(readJSON('crumb_calendar_events', []));
  const visits = toVisitList(readJSON('visitData', []));
  const doneMap = readJSON('crumb_itinerary_done', {}) || {};
  const lockMap = readJSON('crumb_itinerary_locks', {}) || {};
  const todos = readJSON('crumb_todos', []) || [];
  const nowMs = now.getTime();
  const today = keyOf(now);
  const out = [];

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = addDaysToKey(today, i);
    const done = doneMap[day] || [];
    const locks = lockMap[day] || {};
    const stops = [];

    const addAccounts = (list, type, field) =>
      list.filter(hasName).forEach((a) => {
        if (!onItinerary(a, day, field)) return;
        const key = `${type === 'prospect' ? 'p' : 'c'}-${a.id}`;
        const time = typeof locks[key] === 'number' ? locks[key] : dayTimeOf(key, day, visitTimeOn(a, day));
        stops.push({ key, title: a.name, time, place: a.address || '', done: done.includes(key), url: '/itinerary' });
      });
    addAccounts(prospects, 'prospect', PROSPECT_DAYS_FIELD);
    addAccounts(contacts, 'customer', CUSTOMER_DAYS_FIELD);

    const onItin = (ev) => (typeof ev.showInItinerary === 'boolean' ? ev.showInItinerary : Boolean(ev.accountId));
    const appts = events
      .filter((ev) => ev && ev.date === day && typeof ev.start === 'number')
      .filter((ev) => !hiddenByInactive(ev, contacts, prospects))
      .map((ev) => ({
        key: `e-${ev.id}`,
        title: ev.title || 'Appointment',
        time: ev.start,
        place: ev.location || '',
        done: done.includes(`e-${ev.id}`),
        url: '/calendar',
        countsAsStop: onItin(ev),
      }));
    appts.filter((a) => a.countsAsStop).forEach((a) => stops.push({ ...a, url: '/itinerary' }));
    // Events taken off the Calendar that day only remind you if they're still on the Itinerary
    const offCal = (readJSON('crumb_calendar_hidden', {}) || {})[day] || [];
    for (let j = appts.length - 1; j >= 0; j--) if (offCal.includes(appts[j].key)) appts.splice(j, 1);
    visits.forEach((v, idx) => {
      if (!v || v.date !== day) return;
      if (hiddenByInactive(v, contacts, prospects)) return;
      // Same as the Itinerary: a hand-added stop for an account already scheduled that day counts once.
      if (v.accountId) {
        const kind = v.accountType === 'customer' || v.type === 'contact' ? 'c' : 'p';
        if (stops.some((s) => s.key === `${kind}-${v.accountId}`)) return;
      }
      stops.push({ key: `m-${v.id || idx}`, title: v.name || 'Stop', time: hhmmToMinutes(v.time), place: '', done: Boolean(v.done), url: '/itinerary' });
    });

    // Stops swiped off this day's Itinerary list don't get reminders or count in the summary
    const gone = (readJSON('crumb_itinerary_removed', {}) || {})[day] || [];
    for (let j = stops.length - 1; j >= 0; j--) if (gone.includes(stops[j].key)) stops.splice(j, 1);

    // Reminders before visits and appointments (each one once, even if it's on both lists)
    if (settings.lead > 0) {
      const seen = new Set();
      const inc = { ...DEFAULT_NOTIFY.leadInclude, ...(settings.leadInclude || {}) };
      const list = [
        ...(inc.appointments ? appts : []),
        ...(inc.stops ? stops.filter((s) => !String(s.key).startsWith('e-')) : []), // visits and hand-added stops
      ];
      list.forEach((s) => {
        if (s.done || typeof s.time !== 'number' || seen.has(s.key)) return;
        seen.add(s.key);
        const when = at(day, s.time - settings.lead);
        if (Date.parse(when) <= nowMs) return;
        out.push({
          id: `r-${day}-${s.key}-${s.time}-${settings.lead}`,
          at: when,
          title: `${s.title} · ${timeText(s.time)}`,
          body: [`In ${settings.lead} min`, s.place].filter(Boolean).join(' · '),
          url: s.url,
        });
      });
    }

    // To-dos (tasks + follow-up/sample notes) not done and due that day or earlier
    const dueBy = (kinds = { tasks: true, followups: true, samples: true }) => {
      const due = [];
      if (kinds.tasks)
        todos.forEach((t) => t && !t.done && t.due && t.due <= day && due.push({ text: t.text, who: t.accountName, late: t.due < day }));
      [...contacts, ...prospects].filter(hasName).forEach((a) =>
        (a.notes || []).forEach((n) => {
          const c = noteCat(n.category);
          const wanted = (c === 'Follow-up' && kinds.followups) || (c === 'Sample' && kinds.samples);
          if (wanted && n.due && n.due <= day && !isNoteDone(n)) due.push({ text: n.text, who: a.name, late: n.due < day });
        })
      );
      return due;
    };

    // End-of-day reminder: what's still open, in the kinds picked (nothing is sent if it's all done)
    if (settings.afternoon && typeof settings.afternoonTime === 'number') {
      const kinds = { ...DEFAULT_NOTIFY.afternoonInclude, ...(settings.afternoonInclude || {}) };
      const when = at(day, settings.afternoonTime);
      const due = dueBy(kinds);
      if (kinds.stops)
        stops.filter((st) => !st.done).forEach((st) => due.push({ text: st.title, who: '', late: false, stop: true }));
      if (Date.parse(when) > nowMs && due.length) {
        const late = due.filter((d) => d.late).length;
        const list = due.slice(0, 4).map((d) => `${d.stop ? 'Stop: ' : ''}${d.text}${d.who ? ` (${d.who})` : ''}`);
        if (due.length > 4) list.push(`+${due.length - 4} more`);
        out.push({
          id: `a-${day}-${settings.afternoonTime}`,
          at: when,
          title: `Still to do: ${due.length} ${due.length === 1 ? 'item' : 'items'}${late ? ` (${late} overdue)` : ''}`,
          body: list.join(' · '),
          // unchecked stops → open the Itinerary's "Didn't get to these" so they can go on another day
          url: '/wrap-up', // everything still open today, in one place
        });
      }
    }

    // Morning summary: stops + to-dos due (or overdue) that day
    if (settings.morning) {
      const when = at(day, settings.morningTime);
      if (Date.parse(when) > nowMs) {
        const due = dueBy(); // morning summary always counts every kind
        const open = stops.filter((s) => !s.done);
        // "Haven't seen in a while" count as of that morning (Settings → limit; 0 = off)
        const limit = staleDays();
        const staleN = limit ? staleAccounts(contacts, prospects, Math.max(1, limit - i)).length : 0;
        const staleLine = staleN ? `${staleN} ${staleN === 1 ? 'account' : 'accounts'} due for a check-in` : '';
        if (open.length || due.length || staleN) {
          const late = due.filter((d) => d.late).length;
          const title = (open.length || due.length) ? [
            open.length ? `${open.length} ${open.length === 1 ? 'stop' : 'stops'}` : '',
            due.length ? `${due.length} to-do${due.length === 1 ? '' : 's'}${late ? ` (${late} overdue)` : ''}` : '',
          ]
            .filter(Boolean)
            .join(' · ') : staleLine;
          // The rundown: every stop in order, one per line, then to-dos and the check-in count.
          const ordered = [...open].sort((a, b) => (typeof a.time === 'number' ? a.time : 9999) - (typeof b.time === 'number' ? b.time : 9999));
          const MAX_STOPS = 20;
          const stopLines = ordered.slice(0, MAX_STOPS).map((s) => `${typeof s.time === 'number' ? timeText(s.time) : 'Anytime'}  ${s.title}`);
          if (ordered.length > MAX_STOPS) stopLines.push(`+${ordered.length - MAX_STOPS} more stops`);
          const dueLines = due.slice(0, 3).map((d) => `To-do: ${d.text}${d.who ? ` (${d.who})` : ''}`);
          if (due.length > 3) dueLines.push(`+${due.length - 3} more to-dos`);
          const body = [...stopLines, ...dueLines, open.length || due.length ? staleLine : '']
            .filter(Boolean)
            .join('\n')
            .slice(0, 1400);
          out.push({
            id: `m-${day}-${settings.morningTime}`,
            at: when,
            title: `${i === 0 ? 'Today' : fromKey(day).toLocaleDateString('en-US', { weekday: 'long' })}: ${title}`,
            body,
            url: open.length || !due.length ? '/itinerary' : '/todo',
          });
        }
      }
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 300);
}

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server said ${res.status}`);
  return data;
}

// Turn notifications on. Must be called straight from a tap (iPhone requires it).
export async function enableNotifications() {
  const { supported, standalone } = pushSupport();
  if (!supported) {
    throw new Error(
      standalone
        ? "This phone doesn't support notifications for web apps. iPhones need iOS 16.4 or newer."
        : 'Open Crumb from its Home Screen icon (not Safari), then try again.'
    );
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can allow them in iPhone Settings › Crumb › Notifications.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const keyRes = await fetch('/api/push-key').then((r) => r.json()).catch(() => ({}));
  if (!keyRes.publicKey) throw new Error("Crumb's notification server isn't set up yet (keys missing in Vercel).");
  const subscription =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(keyRes.publicKey) }));
  const settings = { ...loadNotifySettings(), enabled: true };
  saveNotifySettings(settings);
  await post('/api/push-sync', { deviceId: deviceId(), subscription: subscription.toJSON(), notifications: buildReminders(settings) });
  return settings;
}

export async function disableNotifications() {
  const settings = { ...loadNotifySettings(), enabled: false };
  saveNotifySettings(settings);
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) await sub.unsubscribe();
  } catch {
    /* ignore */
  }
  await post('/api/push-sync', { deviceId: deviceId(), off: true }).catch(() => {});
  return settings;
}

export async function sendTestNotification() {
  return post('/api/push-test', { deviceId: deviceId() });
}

// Quietly keep the server's reminder list up to date (on open, and when leaving the app).
let lastSync = 0;
let lastSent = ''; // the list last sent successfully (skip sending the same thing again)
export async function syncReminders(force = false) {
  const settings = loadNotifySettings();
  if (!settings.enabled || !pushSupport().supported || Notification.permission !== 'granted') return;
  if (!force && Date.now() - lastSync < 60 * 1000) return;
  const notifications = buildReminders(settings);
  const sig = JSON.stringify(notifications);
  if (!force && sig === lastSent) return; // nothing changed since the last send
  lastSync = Date.now();
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return;
    await post('/api/push-sync', { deviceId: deviceId(), subscription: sub.toJSON(), notifications });
    lastSent = sig;
  } catch {
    lastSync = 0; // didn't go through: try again on the next chance
  }
}

// While Crumb is open, keep the reminder list fresh every minute — checking off stops, adding stops,
// moving times and to-dos all change what the 4 PM and morning reminders should say.
let refreshing = false;
export function startReminderRefresh() {
  if (refreshing) return;
  refreshing = true;
  setInterval(() => {
    if (document.visibilityState === 'visible') syncReminders();
  }, 60 * 1000);
}

export function upcomingCount(settings) {
  return buildReminders(settings).length;
}
