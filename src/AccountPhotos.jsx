// file: src/AccountPhotos.jsx
// "Photos" section on a customer / prospect screen: take or pick photos, see them by date,
// tap one to view it full screen, share or delete it. Saved on this phone (see photos.js).
import React, { useEffect, useRef, useState } from 'react';
import { IoCameraOutline, IoShareOutline, IoTrashOutline, IoClose } from 'react-icons/io5';
import { listPhotos, addPhotos, deletePhoto, photoKey, movePhotos } from './photos';
import { shareFile, safeFileName } from './share';
import { readSaved, PROSPECTS_KEY } from './store';
import './AccountPhotos.css';

// iPhone sometimes won't show a photo straight from its storage (a blue "?" instead of the picture).
// So each photo is copied into memory first, and the copy is what's shown, opened and shared.
// Nothing about the saved photo changes.
function readBytes(blob) {
  if (blob && typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}
async function inMemory(photo) {
  try {
    const bytes = await readBytes(photo.blob);
    if (!bytes || !bytes.byteLength) throw new Error('empty');
    return { ...photo, blob: new Blob([bytes], { type: 'image/jpeg' }) };
  } catch {
    return { ...photo, broken: true };
  }
}

const niceDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function Thumb({ photo, onOpen, onHold }) {
  const [url, setUrl] = useState('');
  const hold = useRef(null);
  const start = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const h = { x: e.clientX, y: e.clientY, fired: false };
    h.timer = setTimeout(() => {
      h.fired = true;
      if (navigator.vibrate) navigator.vibrate(10);
      // The finger lifting sends a tap; swallow it so it doesn't open another photo.
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 800);
      onHold(photo);
    }, 550);
    hold.current = h;
  };
  const move = (e) => {
    const h = hold.current;
    if (h && !h.fired && (Math.abs(e.clientX - h.x) > 10 || Math.abs(e.clientY - h.y) > 10)) {
      clearTimeout(h.timer);
      hold.current = null;
    }
  };
  const end = () => {
    if (hold.current && !hold.current.fired) clearTimeout(hold.current.timer);
  };
  useEffect(() => {
    if (photo.broken) return undefined;
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return (
    <button
      className="ap-thumb"
      onClick={() => {
        if (hold.current && hold.current.fired) {
          hold.current = null; // the lift after a hold
          return;
        }
        onOpen(photo);
      }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      {url && <img src={url} alt="" />}
      {photo.broken && <span className="ap-thumb-broken">Can't open</span>}
      <span className="ap-thumb-date">{niceDate(photo.takenAt)}</span>
    </button>
  );
}

export default function AccountPhotos({ type, id, name }) {
  const key = photoKey(type, id);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(null); // photo being viewed
  const [openUrl, setOpenUrl] = useState('');
  const fileRef = useRef(null);
  const [justTaken, setJustTaken] = useState([]); // photos taken with the camera just now (offer: save to camera roll)

  // Customers converted before Nov 6 may still have photos filed under the old prospect.
  // If no prospect with that id still exists, bring them over (moved, never deleted).
  const rescue = () => {
    if (type !== 'customer') return Promise.resolve();
    const prospects = readSaved(PROSPECTS_KEY, [], { ifUnreadable: null }); // unreadable → don't move anything
    if (!Array.isArray(prospects) || prospects.some((p) => p && String(p.id) === String(id))) return Promise.resolve();
    return movePhotos(photoKey('prospect', id), key).catch(() => {});
  };
  const load = () =>
    rescue()
      .then(() => listPhotos(key))
      .then((rows) => Promise.all(rows.map(inMemory)))
      .then(setPhotos)
      .catch(() => setMsg("Photos aren't available in this browser."));
  useEffect(() => {
    load();
    const again = () => load();
    window.addEventListener('crumb-photos-moved', again);
    return () => window.removeEventListener('crumb-photos-moved', again);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!open || open.broken) return undefined;
    const u = URL.createObjectURL(open.blob);
    setOpenUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [open]);

  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setMsg('');
    try {
      await addPhotos(key, files);
      await load();
      // "Take Photo" pictures aren't in the camera roll; library picks have an older date.
      const fresh = files.filter((f) => !f.lastModified || Date.now() - f.lastModified < 2 * 60 * 1000);
      setJustTaken(fresh);
    } catch (err) {
      setMsg(err.message || "Couldn't save that photo.");
    }
    setBusy(false);
  };

  const share = async () => {
    const file = `${safeFileName(name)} ${open.takenAt.slice(0, 10)}.jpg`;
    setMsg(await shareFile(open.blob, file, name));
  };

  const remove = async (photo = open) => {
    if (!window.confirm("Delete this photo from Crumb? It can't be undone. (Your camera roll isn't touched.)")) return;
    await deletePhoto(photo.id);
    setOpen(null);
    load();
  };

  return (
    <>
      <div className="av-section-title ap-title">
        <span>Photos{photos.length ? ` · ${photos.length}` : ''}</span>
        <button className="ap-add" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
          <IoCameraOutline className="ap-add-icon" />
          {busy ? 'Saving…' : 'Add photo'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="ap-file" onChange={pick} />
      {photos.length > 0 ? (
        <div className="ap-grid">
          {photos.map((p) => (
            <Thumb key={p.id} photo={p} onOpen={setOpen} onHold={(ph) => remove(ph)} />
          ))}
        </div>
      ) : (
        <div className="ap-empty">Take a photo or pick one from your camera roll. It stays with {name || 'this account'}, dated.</div>
      )}
      {justTaken.length > 0 && (
        <div className="ap-saveroll">
          <span>Also save {justTaken.length === 1 ? 'it' : 'them'} to your camera roll?</span>
          <span className="ap-saveroll-btns">
            <button className="ap-saveroll-no" onClick={() => setJustTaken([])}>No</button>
            <button
              className="ap-saveroll-yes"
              onClick={async () => {
                const files = justTaken.map((f, i) =>
                  f.name ? f : new File([f], `Crumb photo ${i + 1}.jpg`, { type: f.type || 'image/jpeg' })
                );
                try {
                  if (navigator.canShare && navigator.canShare({ files })) {
                    await navigator.share({ files });
                    setJustTaken([]);
                    return;
                  }
                  setMsg("This phone can't save from here. Open the photo, tap Share, then Save Image.");
                } catch (err) {
                  if (!err || err.name !== 'AbortError') setMsg("Couldn't open the share menu. Open the photo, tap Share, then Save Image.");
                }
              }}
            >
              Save to camera roll
            </button>
          </span>
          <span className="ap-saveroll-hint">Then tap “Save Image”.</span>
        </div>
      )}
      {msg && <div className="ap-msg">{msg}</div>}

      {open && (
        <div className="ap-viewer" onClick={() => setOpen(null)}>
          <div className="ap-viewer-top" onClick={(e) => e.stopPropagation()}>
            <button className="ap-icon" onClick={() => setOpen(null)} aria-label="Close">
              <IoClose />
            </button>
            <div className="ap-viewer-title">
              <strong>{name}</strong>
              <span>{niceDate(open.takenAt)}</span>
            </div>
            <span className="ap-viewer-actions">
              <button className="ap-icon" onClick={share} aria-label="Share photo">
                <IoShareOutline />
              </button>
              <button className="ap-icon ap-danger" onClick={() => remove()} aria-label="Delete photo">
                <IoTrashOutline />
              </button>
            </span>
          </div>
          {openUrl && <img className="ap-viewer-img" src={openUrl} alt="" />}
        </div>
      )}
    </>
  );
}
