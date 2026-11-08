// file: src/photos.js
// Photos kept with a customer / prospect, saved ON THIS PHONE (IndexedDB — room for thousands;
// localStorage only holds ~5 MB). Each photo is shrunk to about 1600 px / ~250 KB before saving.
// Record: { id, key: 'customer-12' | 'prospect-7', takenAt: ISO date, blob (JPEG), w, h }
const DB_NAME = 'crumb-photos';
const STORE = 'photos';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const st = db.createObjectStore(STORE, { keyPath: 'id' });
        st.createIndex('key', 'key');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Photo storage isn’t available in this browser.'));
    req.onblocked = () => reject(new Error('Photo storage isn’t available in this browser.'));
  });
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const st = t.objectStore(STORE);
        const out = fn(st);
        t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
        t.onerror = () => reject(t.error || new Error('Couldn’t save to photo storage on this device.'));
        t.onabort = () => reject(t.error || new Error('Couldn’t save to photo storage on this device.'));
      })
  );
}

export const photoKey = (type, id) => `${type}-${id}`;

// Newest first
export async function listPhotos(key) {
  const rows = await tx('readonly', (st) => st.index('key').getAll(key));
  return (rows || []).sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)));
}

export async function allPhotos() {
  return (await tx('readonly', (st) => st.getAll())) || [];
}

// Every photo of one account (when the account itself is deleted).
export async function deleteAccountPhotos(key) {
  const rows = await listPhotos(key);
  await tx('readwrite', (st) => rows.forEach((p) => st.delete(p.id)));
  return rows.length;
}

// Move every photo of one account to another key (prospect → customer on Convert). Nothing is deleted.
export async function movePhotos(fromKey, toKey) {
  if (fromKey === toKey) return 0;
  const rows = await listPhotos(fromKey);
  if (!rows.length) return 0;
  await tx('readwrite', (st) => rows.forEach((p) => st.put({ ...p, key: toKey })));
  return rows.length;
}

export function deletePhoto(id) {
  return tx('readwrite', (st) => st.delete(id));
}

export function putPhoto(rec) {
  return tx('readwrite', (st) => st.put(rec));
}

// Shrink a picked / taken photo to a JPEG (keeps it upright; iPhone HEIC comes in as JPEG).
function shrink(file, maxSide = 1600, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error('Could not read that photo'))), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that photo'));
    };
    img.src = url;
  });
}

export async function addPhotos(key, files) {
  // Ask the phone to keep this data (helps it not get cleared when storage is low).
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {
    /* not critical */
  }
  const added = [];
  for (const f of files) {
    const { blob, w, h } = await shrink(f);
    const when = f.lastModified ? new Date(f.lastModified) : new Date();
    // A photo just taken has "now" as its time; one from the camera roll keeps when it was taken.
    const rec = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, key, takenAt: when.toISOString(), blob, w, h };
    await putPhoto(rec);
    added.push(rec);
  }
  return added;
}

/* ---------- Backup support: photos travel inside the backup file as text ---------- */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
// Every photo as text for the backup file. Photos that can't be read are NOT silently dropped:
// they come back in `failed` (with the account key) so the backup screen can say so.
// If the photo storage can't be opened at all, this throws.
export async function photosForBackup() {
  const rows = await allPhotos();
  const photos = [];
  const failed = [];
  for (const p of rows) {
    try {
      if (!(p.blob instanceof Blob) || !p.blob.size) throw new Error('empty');
      photos.push({ ...p, blob: undefined, data: await blobToDataUrl(p.blob) });
    } catch {
      failed.push({ id: p.id, key: p.key });
    }
  }
  return { photos, failed };
}

// Turn a backup photo back into a picture file AND make sure it actually opens as an image.
// Rejects if the photo is damaged.
export async function decodeBackupPhoto(p) {
  if (!p || !p.id || typeof p.data !== 'string' || !p.data.startsWith('data:image')) throw new Error('bad photo');
  const blob = await dataUrlToBlob(p.data);
  if (!blob.size) throw new Error('empty photo');
  await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      img.naturalWidth > 0 ? resolve() : reject(new Error('bad photo'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('bad photo'));
    };
    img.src = url;
  });
  return { id: p.id, key: p.key, takenAt: p.takenAt, w: p.w, h: p.h, blob };
}

// Save many photos in ONE step: either all are saved or none are.
export function putPhotosAll(records) {
  if (!records.length) return Promise.resolve();
  return tx('readwrite', (st) => records.forEach((r) => st.put(r)));
}

// Put the photo storage back the way it was before a restore (used if a restore fails part-way):
// photos the restore added are removed; photos it replaced get their old version back.
export function rollbackPhotos(addedIds, replacedRecords) {
  return tx('readwrite', (st) => {
    addedIds.forEach((id) => st.delete(id));
    replacedRecords.forEach((r) => st.put(r));
  });
}

// Empty the photo storage on this device (setup: after the photos were kept in the safety copy).
export function clearAllPhotos() {
  return tx('readwrite', (st) => st.clear());
}

export async function photoIds() {
  return ((await tx('readonly', (st) => st.getAllKeys())) || []).map(String);
}

/* ---------- Safety copy (phone's data from just before a restore) ----------
   Kept in its own small IndexedDB database — much more room than localStorage, and separate
   from the photos so it can never get in their way. */
const SAFETY_DB = 'crumb-safety';
function safetyDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SAFETY_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('copies')) req.result.createObjectStore('copies');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Photo storage isn’t available in this browser.'));
    req.onblocked = () => reject(new Error('Photo storage isn’t available in this browser.'));
  });
}
function safetyTx(mode, fn) {
  return safetyDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('copies', mode);
        const out = fn(t.objectStore('copies'));
        t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
        t.onerror = () => reject(t.error || new Error('Couldn’t save to photo storage on this device.'));
        t.onabort = () => reject(t.error || new Error('Couldn’t save to photo storage on this device.'));
      })
  );
}
export const saveSafetyCopy = (copy) => safetyTx('readwrite', (st) => st.put(copy, 'last'));
export const loadSafetyCopy = () => safetyTx('readonly', (st) => st.get('last')).then((v) => v || null);
