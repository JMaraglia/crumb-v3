// file: src/syncPhotos.js
// Sync step S6 (Nov 7 2026): photos travel between your devices — TEST COPY ONLY (run from syncSend.js).
//
// Photos live on the phone in IndexedDB (photos.js). In the cloud, each photo is a file in the private
// "photos" storage bucket (<workspace>/<photo id>.jpg) plus a row in the photos table (which account, when).
//
// Each check (every 30 seconds, with the rest of sync):
//   1. UP:   photos added here are uploaded; photos moved to another account (Convert) follow; photos
//            deleted here are MARKED deleted in the cloud (the file itself is never erased).
//   2. DOWN: photos added on your other device are downloaded; ones deleted there are removed here.
// "Sent" bookkeeping (crumb_sync_photos: photo id → account key) stays on this device.
// Safety brake both ways: more than 10% AND more than 3 photos disappearing at once → nothing is deleted.
import { allPhotos, putPhoto, deletePhoto } from './photos';
import { readText, writeText, loadCustomers, loadProspects } from './store';

export const PHOTOS_SENT_KEY = 'crumb_sync_photos';
export const PHOTOS_PULLED_KEY = 'crumb_sync_photos_pulled_at';
const BUCKET = 'photos';

const tooMany = (n, of) => n > 3 && n > of * 0.1;

// 'prospect-11' → { type: 'prospect', id: '11' }
export function splitKey(key) {
  const s = String(key || '');
  const i = s.indexOf('-');
  return i > 0 ? { type: s.slice(0, i), id: s.slice(i + 1) } : null;
}

// What to send up. local: [{ id, key }], sent: { id: key }
export function planPhotoPush(local, sent) {
  const up = [];
  const moved = [];
  const gone = [];
  const here = new Set();
  local.forEach((p) => {
    here.add(String(p.id));
    if (!(p.id in sent)) up.push(p);
    else if (sent[p.id] !== p.key) moved.push(p);
  });
  Object.keys(sent).forEach((id) => {
    if (!here.has(id)) gone.push(id);
  });
  const blocked = tooMany(gone.length, Object.keys(sent).length);
  return { up, moved, gone: blocked ? [] : gone, blocked };
}

// What to bring down. rows: cloud photo rows; localById: Map id → { key }; keyFor: account id → local key
export function planPhotoPull(rows, localById, keyFor) {
  const download = [];
  const rekey = [];
  const remove = [];
  rows.forEach((r) => {
    const id = String(r.id);
    const here = localById.get(id);
    if (r.deleted_at) {
      if (here) remove.push(id);
      return;
    }
    const key = keyFor(String(r.account_id));
    if (!key) return; // its account isn't on this device (yet)
    if (!here) download.push({ row: r, key });
    else if (here.key !== key) rekey.push({ id, key });
  });
  const blocked = tooMany(remove.length, localById.size);
  return { download, rekey, remove: blocked ? [] : remove, blocked };
}

function accountKeyFinder() {
  const map = new Map();
  loadCustomers().forEach((a) => a && a.id != null && map.set(String(a.id), `customer-${a.id}`));
  loadProspects().forEach((a) => a && a.id != null && !map.has(String(a.id)) && map.set(String(a.id), `prospect-${a.id}`));
  return (id) => map.get(id) || null;
}

const readSent = () => {
  try {
    const v = JSON.parse(readText(PHOTOS_SENT_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

// One full photo check. Returns { up, down, removed, note }.
export async function syncPhotos(sb, ws) {
  const sent = readSent();
  const saveSent = () => writeText(PHOTOS_SENT_KEY, JSON.stringify(sent));
  const out = { up: 0, down: 0, removed: 0, note: '' };

  // ---------- 1. up
  const local = await allPhotos();
  const push = planPhotoPush(local, sent);
  if (push.blocked) out.note = 'Safety brake: many photos are missing on this device, so they were not deleted in the cloud.';
  for (const p of push.up) {
    const acct = splitKey(p.key);
    if (!acct || !p.blob) continue;
    const path = `${ws}/${p.id}.jpg`;
    const { error: e1 } = await sb.storage.from(BUCKET).upload(path, p.blob, { contentType: 'image/jpeg', upsert: true });
    if (e1) continue; // try again next check
    const { error: e2 } = await sb.from('photos').upsert({
      workspace_id: ws, id: String(p.id), account_id: acct.id, storage_path: path, taken_at: p.takenAt || null,
      data: { w: p.w || null, h: p.h || null }, deleted_at: null,
    });
    if (e2) continue; // e.g. its account hasn't reached the cloud yet: next check
    sent[p.id] = p.key;
    out.up += 1;
    saveSent();
  }
  for (const p of push.moved) {
    const acct = splitKey(p.key);
    if (!acct) continue;
    const { error } = await sb.from('photos').update({ account_id: acct.id }).eq('workspace_id', ws).eq('id', String(p.id));
    if (!error) {
      sent[p.id] = p.key;
      saveSent();
    }
  }
  for (const id of push.gone) {
    const { error } = await sb.from('photos').update({ deleted_at: new Date().toISOString() }).eq('workspace_id', ws).eq('id', id);
    if (!error) {
      delete sent[id];
      saveSent();
    }
  }

  // ---------- 2. down
  const since = readText(PHOTOS_PULLED_KEY) || '';
  let q = sb.from('photos').select('id, account_id, storage_path, taken_at, data, deleted_at, updated_at').eq('workspace_id', ws);
  if (since) q = q.gt('updated_at', since);
  const { data: rows, error } = await q;
  if (error) throw error;
  const now = await allPhotos();
  const byId = new Map(now.map((p) => [String(p.id), p]));
  const pull = planPhotoPull(rows || [], byId, accountKeyFinder());
  if (pull.blocked) out.note = 'Safety brake: the cloud asked to remove many photos at once, so none were removed.';
  let allOk = true;
  for (const { row, key } of pull.download) {
    const { data: file, error: e } = await sb.storage.from(BUCKET).download(row.storage_path || `${ws}/${row.id}.jpg`);
    if (e || !file) {
      allOk = false;
      continue;
    }
    // copy the bytes into a fresh JPEG (iPhones can lose downloaded files that aren't copied)
    const blob = new Blob([await file.arrayBuffer()], { type: 'image/jpeg' });
    const d = row.data || {};
    await putPhoto({ id: String(row.id), key, takenAt: row.taken_at || new Date().toISOString(), blob, w: d.w || undefined, h: d.h || undefined });
    sent[String(row.id)] = key; // it came from the cloud: never upload it back
    saveSent();
    out.down += 1;
  }
  for (const { id, key } of pull.rekey) {
    const p = byId.get(id);
    await putPhoto({ ...p, key });
    sent[id] = key;
    saveSent();
  }
  for (const id of pull.remove) {
    await deletePhoto(id);
    delete sent[id];
    saveSent();
    out.removed += 1;
  }
  // Next time ask from a little before the newest change seen (bringing one down twice changes nothing).
  // If a download failed or the brake stopped something, ask for the same changes again next time.
  if (allOk && !pull.blocked && rows && rows.length) {
    const newest = rows.reduce((m, r) => (String(r.updated_at) > m ? String(r.updated_at) : m), '');
    const t = Date.parse(newest);
    if (!Number.isNaN(t)) writeText(PHOTOS_PULLED_KEY, new Date(t - 120000).toISOString());
  }
  return out;
}
