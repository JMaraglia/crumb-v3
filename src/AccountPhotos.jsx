// file: src/AccountPhotos.jsx
// "Photos" section on a customer / prospect screen: take or pick photos, see them by date,
// tap one to view it full screen, share or delete it. Saved on this phone (see photos.js).
import React, { useEffect, useRef, useState } from 'react';
import { IoCameraOutline, IoShareOutline, IoTrashOutline, IoClose } from 'react-icons/io5';
import { listPhotos, addPhotos, deletePhoto, photoKey } from './photos';
import { shareFile, safeFileName } from './share';
import './AccountPhotos.css';

const niceDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function Thumb({ photo, onOpen }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return (
    <button className="ap-thumb" onClick={() => onOpen(photo)}>
      {url && <img src={url} alt="" />}
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

  const load = () =>
    listPhotos(key)
      .then(setPhotos)
      .catch(() => setMsg("Photos aren't available in this browser."));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!open) return undefined;
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

  const remove = async () => {
    if (!window.confirm('Delete this photo? It can\'t be undone.')) return;
    await deletePhoto(open.id);
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
            <Thumb key={p.id} photo={p} onOpen={setOpen} />
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
              <button className="ap-icon ap-danger" onClick={remove} aria-label="Delete photo">
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
