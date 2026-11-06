// POST /api/route-plan  — drive times between the day's stops, for "Optimize Route".
// Body: { points: [{ id, address } | { id, lat, lon }] }  (first point = where you are)
// Returns: { coords: { id: [lat, lon] | null }, minutes: [[…]] } — minutes[i][j] = drive time i → j (null = no route).
// The Geoapify key lives only in Vercel (GEOAPIFY_KEY); it never reaches the phone.
import { readJsonBody } from './_push.js';

const GEO = 'https://api.geoapify.com/v1';
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

async function geocode(address, key) {
  const url = `${GEO}/geocode/search?text=${encodeURIComponent(address)}&filter=countrycode:us&limit=1&format=json&apiKey=${key}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const hit = j && Array.isArray(j.results) && j.results[0];
  return hit && typeof hit.lat === 'number' ? [hit.lat, hit.lon] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEOAPIFY_KEY;
  if (!key) return res.status(500).json({ error: 'Route planning is not set up yet.' });
  try {
    const { points } = readJsonBody(req);
    if (!Array.isArray(points) || points.length < 2 || points.length > 30) return res.status(400).json({ error: 'Need 2–30 places' });
    const coords = {};
    for (const p of points) {
      const id = clip(p.id, 60);
      if (typeof p.lat === 'number' && typeof p.lon === 'number') coords[id] = [p.lat, p.lon];
      else if (p.address) coords[id] = await geocode(clip(p.address, 200), key);
      else coords[id] = null;
    }
    const ids = points.map((p) => clip(p.id, 60));
    const found = ids.filter((id) => coords[id]);
    const minutes = ids.map(() => ids.map(() => null));
    if (found.length >= 2) {
      const locs = found.map((id) => ({ location: [coords[id][1], coords[id][0]] }));
      const r = await fetch(`${GEO}/routematrix?apiKey=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'drive', sources: locs, targets: locs }),
      });
      if (!r.ok) return res.status(502).json({ error: 'Map service is busy. Try again in a minute.' });
      const j = await r.json();
      (j.sources_to_targets || []).forEach((row, a) =>
        (row || []).forEach((cell) => {
          const from = ids.indexOf(found[a]);
          const to = ids.indexOf(found[cell.target_index]);
          if (from >= 0 && to >= 0 && cell && typeof cell.time === 'number') minutes[from][to] = Math.round(cell.time / 60);
        })
      );
    }
    res.status(200).json({ coords, minutes });
  } catch (err) {
    console.error('route-plan', err); // eslint-disable-line no-console
    res.status(500).json({ error: "Couldn't plan the route right now." });
  }
}
