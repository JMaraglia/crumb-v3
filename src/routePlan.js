// file: src/routePlan.js
// "Optimize Route": put the day's flexible stops in the shortest driving order, starting from where
// you are, and give them times (drive time + visit length). Locked stops and calendar appointments
// never move — flexible stops are fitted into the gaps around them.
import { loadObject, saveQuiet, GEO_CACHE_KEY } from './store';

const CACHE_KEY = GEO_CACHE_KEY; // { address: [lat, lon] } so addresses aren't looked up twice

const readCache = () => {
  return loadObject(CACHE_KEY);
};
const up5 = (m) => Math.ceil(m / 5) * 5;

function here() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

// stops: the Itinerary's stops for the day. len(stop) → minutes. startTime: minutes from midnight.
// Returns { plan: [{ stop, time, fixed, drive }], changes: [{ stop, time }], skipped: [stop], driveTotal, fromHere }
export async function planRoute(stops, len, startTime) {
  const open = stops.filter((s) => !s.done);
  const fixed = open.filter((s) => s.locked && typeof s.time === 'number').sort((a, b) => a.time - b.time);
  const flex = open.filter((s) => !s.locked && s.kind !== 'event' && s.address && s.address.trim());
  const skipped = open.filter((s) => !s.locked && s.kind !== 'event' && !(s.address && s.address.trim()));
  if (flex.length < 2) throw new Error('Needs at least 2 stops with an address that aren’t locked.');

  const me = await here();
  const cache = readCache();
  const pt = (s) => {
    const a = (s.address || '').trim();
    return cache[a] ? { id: s.key, lat: cache[a][0], lon: cache[a][1] } : { id: s.key, address: a };
  };
  const placed = fixed.filter((s) => s.address && s.address.trim());
  const points = [...(me ? [{ id: 'here', lat: me[0], lon: me[1] }] : []), ...flex.map(pt), ...placed.map(pt)];
  const r = await fetch('/api/route-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Couldn't plan the route right now.");

  // remember found addresses
  [...flex, ...placed].forEach((s) => {
    const c = j.coords && j.coords[s.key];
    if (c) cache[(s.address || '').trim()] = c;
  });
  saveQuiet(CACHE_KEY, cache); // not critical if it can't save

  const ids = points.map((p) => p.id);
  const drive = (a, b) => {
    if (a == null || b == null) return 0;
    const v = j.minutes && j.minutes[ids.indexOf(a)] ? j.minutes[ids.indexOf(a)][ids.indexOf(b)] : null;
    return typeof v === 'number' ? v : 20; // no route found: assume 20 minutes
  };
  const located = (s) => j.coords && j.coords[s.key];
  const lost = flex.filter((s) => !located(s));
  const todo = flex.filter((s) => located(s));

  const ctx = { fixed, drive, located, len, startTime, start: me ? 'here' : null, skipped: [...skipped, ...lost], fromHere: Boolean(me) };
  return { ...timeRoute(ctx, todo, null), ctx };
}

// Lay the stops out in time. order = null → nearest stop next (the optimizer); or a list of stops
// in the order you want (re-timed after you move one up/down in the preview).
export function timeRoute(ctx, stops, order) {
  const { fixed, drive, located, len, startTime } = ctx;
  const todo = order ? [...order] : [...stops];
  let pos = ctx.start;
  let time = startTime;
  let driveTotal = 0;
  const plan = [];
  let fi = 0;
  const nextFixed = () => {
    while (fi < fixed.length && fixed[fi].time + len(fixed[fi]) <= time) fi += 1;
    return fixed[fi] || null;
  };
  const goToFixed = (fx) => {
    if (pos && located(fx)) driveTotal += drive(pos, fx.key);
    plan.push({ stop: fx, time: fx.time, fixed: true });
    time = Math.max(time, fx.time + len(fx));
    if (located(fx)) pos = fx.key;
    fi += 1;
  };
  let guard = 0;
  while (todo.length && guard++ < 300) {
    const fx = nextFixed();
    if (fx && fx.time <= time) {
      goToFixed(fx);
      continue;
    }
    const options = (order ? [todo[0]] : todo)
      .map((s) => {
        const d = pos ? drive(pos, s.key) : 0;
        const at = up5(time + d);
        const fits = !fx || at + len(s) + (located(fx) ? drive(s.key, fx.key) : 0) <= fx.time;
        return { s, d, at, fits };
      })
      .sort((a, b) => a.d - b.d);
    const pick = options.find((o) => o.fits);
    if (!pick && fx) {
      goToFixed(fx); // nothing fits before it: go there, carry on after it
      continue;
    }
    const o = pick || options[0];
    plan.push({ stop: o.s, time: Math.min(o.at, 23 * 60 + 55), fixed: false, drive: o.d });
    driveTotal += o.d;
    time = o.at + len(o.s);
    pos = o.s.key;
    todo.splice(todo.indexOf(o.s), 1);
  }
  fixed.forEach((f) => {
    if (!plan.some((p) => p.stop.key === f.key)) plan.push({ stop: f, time: f.time, fixed: true });
  });
  plan.sort((a, b) => a.time - b.time || (a.fixed ? -1 : 1));
  const changes = plan.filter((p) => !p.fixed && p.time !== p.stop.time).map((p) => ({ stop: p.stop, time: p.time }));
  return { plan, changes, skipped: ctx.skipped, driveTotal, fromHere: ctx.fromHere };
}
