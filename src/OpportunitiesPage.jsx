// file: src/OpportunitiesPage.jsx
// Opportunities (Nov 19, 2026): its own list, separate from To-Do. Looks like To-Do (reuses its td- styles).
// Saved under crumb_opportunities: [{ id, title, term: 'short' | 'long', followUp: 'YYYY-MM-DD' | null,
//   notes, status: 'open' | 'won' | 'lost', closedAt, createdAt, accountType, accountId, accountName,
//   photoIds: [ids of that customer's photos linked to this opportunity] }]
// Industry-neutral on purpose: no product, quantity or dollar fields.
// Every opportunity is linked to a customer (Nov 19: prospects don't have opportunities).
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline, IoChevronDown, IoChevronForward, IoCameraOutline, IoClose, IoCheckmark } from 'react-icons/io5';
import { listPhotos, addPhotos, photoKey } from './photos';
import { inMemory } from './AccountPhotos';
import { shareText } from './share';
import { loadOpportunities, saveOpportunities as storeOpportunities } from './store';
import { useCloudRefresh } from './useCloudRefresh';
import SwipeRow from './SwipeRow';
import './TodoPage.css';
import './AccountPhotos.css'; // the full-screen photo viewer
import './OpportunitiesPage.css';

const keyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (k, n) => {
  const [y, m, d] = k.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
};
const niceDate = (k, today) => {
  if (!k) return '';
  if (k === today) return 'Today';
  if (k === addDays(today, 1)) return 'Tomorrow';
  if (k === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = k.split('-').map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
};
const hasName = (a) => a && a.name && a.name.trim();
const newId = () => `o-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const TERMS = [
  ['short', 'Short-Term'],
  ['long', 'Long-Term'],
];

export default function OpportunitiesPage({ contacts = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from a customer's profile: ?customer=<id> (add for that customer) or ?open=<id> (edit that one).
  const params = new URLSearchParams(location.search);
  const fromAccount = params.has('customer') || params.has('open');
  const titleRef = useRef(null);
  const today = keyOf(new Date());
  const [opps, setOpps] = useState(loadOpportunities);
  useCloudRefresh(() => setOpps(loadOpportunities())); // changes from your other device, re-read in place
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState('short');
  const [followUp, setFollowUp] = useState(null);
  const [acct, setAcct] = useState(null); // the customer this one is for
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [closing, setClosing] = useState(null); // opportunity being marked Won / Lost
  const [showWon, setShowWon] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState(null); // { opp, timer }

  useEffect(() => {
    const cid = params.get('customer');
    const oid = params.get('open');
    if (cid) {
      const c = contacts.find((a) => hasName(a) && String(a.id) === cid);
      if (c) setAcct({ type: 'customer', id: c.id, name: c.name });
      if (titleRef.current) titleRef.current.focus();
    }
    if (oid) {
      const o = loadOpportunities().find((x) => x && String(x.id) === oid);
      if (o) setEditing(o);
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const goBack = () => (fromAccount ? navigate(-1) : navigate('/'));

  const save = (next) => {
    setOpps(next);
    storeOpportunities(next);
  };
  const change = (id, patch) => save(opps.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  /* ---- the list ---- */
  const open = opps.filter((o) => o && o.status !== 'won' && o.status !== 'lost');
  const byFollowUp = (a, b) => (a.followUp || '9999').localeCompare(b.followUp || '9999') || (a.title || '').localeCompare(b.title || '');
  const sections = TERMS.map(([t, label]) => ({ title: label, list: open.filter((o) => (o.term === 'long' ? 'long' : 'short') === t).sort(byFollowUp) }));
  const byClosed = (a, b) => (Date.parse(b.closedAt) || 0) - (Date.parse(a.closedAt) || 0);
  const won = opps.filter((o) => o && o.status === 'won').sort(byClosed);
  const lost = opps.filter((o) => o && o.status === 'lost').sort(byClosed);

  /* ---- changes ---- */
  const customers = contacts.filter(hasName).map((a) => ({ type: 'customer', id: a.id, name: a.name }));
  const matches = search.trim()
    ? customers.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 5)
    : [];

  const add = () => {
    const t = title.trim();
    if (!t || !acct) return;
    save([
      ...opps,
      { id: newId(), title: t, term, followUp, notes: '', status: 'open', closedAt: null, createdAt: new Date().toISOString(), accountType: 'customer', accountId: acct.id, accountName: acct.name },
    ]);
    setTitle('');
    setFollowUp(null);
    setAcct(null);
    if (params.has('customer')) navigate(-1); // added from the customer's profile: back to it
  };
  const close = (opp, status) => {
    change(opp.id, { status, closedAt: new Date().toISOString() });
    setClosing(null);
  };
  const reopen = (opp) => change(opp.id, { status: 'open', closedAt: null });
  const remove = (opp) => {
    save(opps.filter((o) => o.id !== opp.id));
    if (undo && undo.timer) clearTimeout(undo.timer);
    const timer = setTimeout(() => setUndo(null), 6000);
    setUndo({ opp, timer });
    setEditing(null);
    return true;
  };
  const undoDelete = () => {
    if (!undo) return;
    clearTimeout(undo.timer);
    save([...loadOpportunities(), undo.opp]);
    setUndo(null);
  };

  const share = async () => {
    const lines = ['Opportunities'];
    sections.forEach((s) => {
      if (!s.list.length) return;
      lines.push('', s.title.toUpperCase());
      s.list.forEach((o) => {
        const extra = [o.accountName, o.followUp ? `Follow up ${niceDate(o.followUp, today)}` : ''].filter(Boolean).join(' · ');
        lines.push(`• ${o.title}${extra ? ` (${extra})` : ''}`);
      });
    });
    setMessage(await shareText('Opportunities', lines.join('\n')));
  };

  const renderRow = (o) => {
    const closed = o.status === 'won' || o.status === 'lost';
    const late = !closed && o.followUp && o.followUp < today;
    return (
      <SwipeRow key={o.id} wrapClassName="td-swipe" className={`td-row ${closed ? 'is-done' : ''}`} onDelete={() => remove(o)}>
        <button
          className={`td-check ${o.status === 'won' ? 'is-checked' : ''} ${o.status === 'lost' ? 'op-check-lost' : ''}`}
          onClick={() => (closed ? reopen(o) : setClosing(o))}
          aria-label={closed ? 'Reopen' : 'Mark Won or Lost'}
        >
          {o.status === 'won' ? '✓' : o.status === 'lost' ? '✕' : ''}
        </button>
        <button className="td-main" onClick={() => setEditing(o)}>
          <span className="td-text">{o.title}</span>
          <span className="td-meta">
            {closed && <span className={`td-tag op-tag-${o.status}`}>{o.status === 'won' ? 'Won' : 'Lost'}</span>}
            {o.accountName && <span className={`td-acct ${o.accountType}`}>{o.accountName}</span>}
            {!closed && o.followUp && <span className={`td-due ${late ? 'is-late' : ''}`}>Follow Up {niceDate(o.followUp, today)}</span>}
            {Array.isArray(o.photoIds) && o.photoIds.length > 0 && (
              <span className="op-photo-count">
                <IoCameraOutline /> {o.photoIds.length}
              </span>
            )}
          </span>
        </button>
      </SwipeRow>
    );
  };

  const closedSection = (label, list, shown, setShown) =>
    list.length > 0 && (
      <div className="td-section">
        <button className="td-done-toggle" onClick={() => setShown(!shown)}>
          {shown ? <IoChevronDown /> : <IoChevronForward />} {label} <span className="td-count">{list.length}</span>
        </button>
        {shown && <div className="td-list">{list.map(renderRow)}</div>}
      </div>
    );

  return (
    <div className="td-page op-page">
      <header className="td-header">
        <button className="td-icon-btn" onClick={goBack} aria-label="Back">
          <FaArrowLeft />
        </button>
        <span />
        <span />
      </header>

      <div className="td-content">
        <div className="td-title-row">
          <h1 className="td-title">Opportunities</h1>
          <button className="td-pill" disabled={!open.length} onClick={share}>
            <IoShareOutline className="td-pill-icon" />
            Share
          </button>
        </div>
        {message && <div className="td-message">{message}</div>}

        {/* Add an opportunity */}
        <div className="td-add">
          <input
            ref={titleRef}
            className="td-add-input"
            placeholder="Add an opportunity…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <div className="op-add-acct">
            {acct ? (
              <span className="td-picked">
                {acct.name}
                <button className="td-picked-x" onClick={() => setAcct(null)} aria-label="Remove">×</button>
              </span>
            ) : (
              <input className="op-acct-input" placeholder="Customer" value={search} onChange={(e) => setSearch(e.target.value)} />
            )}
          </div>
          {!acct &&
            matches.map((a) => (
              <button
                key={a.id}
                className="td-match op-add-match"
                onClick={() => {
                  setAcct(a);
                  setSearch('');
                }}
              >
                {a.name}
              </button>
            ))}
          <div className="td-add-row">
            {TERMS.map(([t, label]) => (
              <button key={t} className={`td-chip ${term === t ? 'is-on' : ''}`} onClick={() => setTerm(t)}>
                {label}
              </button>
            ))}
            <label className={`td-chip td-chip-date ${followUp ? 'is-on' : ''}`}>
              {followUp ? niceDate(followUp, today) : 'Follow Up'}
              <input type="date" className="td-date-hidden" value={followUp || ''} onChange={(e) => setFollowUp(e.target.value || null)} />
            </label>
            <span className="td-spacer" />
            <button className="td-add-btn" disabled={!title.trim() || !acct} onClick={add}>
              Add
            </button>
          </div>
        </div>

        {open.length === 0 && <div className="td-empty">No open opportunities.</div>}

        {sections.map((s) =>
          s.list.length ? (
            <div key={s.title} className="td-section">
              <div className="td-section-title tone-blue">
                {s.title} <span className="td-count">{s.list.length}</span>
              </div>
              <div className="td-list">{s.list.map(renderRow)}</div>
            </div>
          ) : null
        )}

        {closedSection('Won', won, showWon, setShowWon)}
        {closedSection('Lost', lost, showLost, setShowLost)}
        <div className="td-hint">Tap the circle for Won or Lost · Tap to change · Swipe left to delete</div>
      </div>

      {undo && (
        <div className="td-undo">
          <span>Opportunity deleted</span>
          <button className="td-undo-btn" onClick={undoDelete}>
            Undo
          </button>
        </div>
      )}

      {closing && (
        <div className="td-sheet-backdrop" onClick={() => setClosing(null)}>
          <div className="td-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="td-sheet-top">
              <button className="td-link" onClick={() => setClosing(null)}>Cancel</button>
              <div className="td-sheet-title">Close Out</div>
              <span />
            </div>
            <div className="op-close-name">{closing.title}</div>
            <div className="op-close-btns">
              <button className="op-close-btn is-won" onClick={() => close(closing, 'won')}>Won</button>
              <button className="op-close-btn is-lost" onClick={() => close(closing, 'lost')}>Lost</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <EditSheet
          opp={editing}
          accounts={customers}
          onSave={(patch) => {
            change(editing.id, patch);
            setEditing(null);
            if (params.has('open')) navigate(-1); // opened from the customer's profile: back to it
          }}
          onDelete={() => remove(editing)}
          onOpenAccount={() =>
            navigate(editing.accountType === 'prospect' ? `/prospects/${editing.accountId}` : `/customers/${editing.accountId}`)
          }
          onCancel={() => {
            setEditing(null);
            if (params.has('open')) navigate(-1);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Change an opportunity ---------- */
function EditSheet({ opp, accounts, onSave, onDelete, onOpenAccount, onCancel }) {
  const [title, setTitle] = useState(opp.title || '');
  const [term, setTerm] = useState(opp.term === 'long' ? 'long' : 'short');
  const [followUp, setFollowUp] = useState(opp.followUp || '');
  const [notes, setNotes] = useState(opp.notes || '');
  const [status, setStatus] = useState(opp.status === 'won' || opp.status === 'lost' ? opp.status : 'open');
  const [acct, setAcct] = useState(
    opp.accountId != null && opp.accountType ? { type: opp.accountType, id: opp.accountId, name: opp.accountName } : null
  );
  const [search, setSearch] = useState('');
  const [photoIds, setPhotoIds] = useState(Array.isArray(opp.photoIds) ? opp.photoIds : []);
  const matches = search.trim()
    ? accounts.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 5)
    : [];

  const save = () => {
    if (!acct) return; // every opportunity needs a customer
    const wasClosed = opp.status === 'won' || opp.status === 'lost';
    onSave({
      title: title.trim() || opp.title,
      term,
      followUp: followUp || null,
      notes: notes.trim(),
      status,
      closedAt: status === 'open' ? null : wasClosed && opp.status === status ? opp.closedAt : new Date().toISOString(),
      accountType: acct ? acct.type : null,
      accountId: acct ? acct.id : null,
      accountName: acct ? acct.name : '',
      photoIds,
    });
  };

  return (
    <div className="td-sheet-backdrop" onClick={onCancel}>
      <div className="td-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="td-sheet-top">
          <button className="td-link" onClick={onCancel}>Cancel</button>
          <div className="td-sheet-title">Opportunity</div>
          <button className="td-link td-bold" disabled={!acct} onClick={save}>Save</button>
        </div>

        <div className="td-sheet-group">
          <textarea className="td-sheet-text" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="td-sheet-row">
            <span>Term</span>
            <span className="op-seg">
              {TERMS.map(([t, label]) => (
                <button key={t} className={`td-chip ${term === t ? 'is-on' : ''}`} onClick={() => setTerm(t)}>
                  {label}
                </button>
              ))}
            </span>
          </div>
          <label className="td-sheet-row">
            <span>Follow Up</span>
            <span className="td-sheet-due">
              {followUp && <button className="td-clear" onClick={() => setFollowUp('')}>Clear</button>}
              <input type="date" className="td-sheet-date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </span>
          </label>
          <div className="td-sheet-row td-sheet-acct">
            <span>Account</span>
            {acct ? (
              <span className="td-picked">
                {acct.name}
                <button
                  className="td-picked-x"
                  onClick={() => {
                    setAcct(null);
                    setPhotoIds([]); // linked photos belong to that customer
                  }}
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ) : (
              <input className="td-acct-search" placeholder="Customer" value={search} onChange={(e) => setSearch(e.target.value)} />
            )}
          </div>
          {!acct &&
            matches.map((a) => (
              <button
                key={`${a.type}-${a.id}`}
                className="td-match"
                onClick={() => {
                  setAcct(a);
                  setSearch('');
                }}
              >
                {a.name}
              </button>
            ))}
          <div className="td-sheet-row">
            <span>Status</span>
            <span className="op-seg">
              {[
                ['open', 'Open'],
                ['won', 'Won'],
                ['lost', 'Lost'],
              ].map(([s, label]) => (
                <button key={s} className={`td-chip ${status === s ? 'is-on' : ''}`} onClick={() => setStatus(s)}>
                  {label}
                </button>
              ))}
            </span>
          </div>
          {acct && <OppPhotos customer={acct} photoIds={photoIds} setPhotoIds={setPhotoIds} />}
          <textarea className="td-sheet-text op-notes" rows={3} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="td-sheet-actions">
          {opp.accountId != null && opp.accountType && (
            <button className="td-sheet-btn" onClick={onOpenAccount}>
              Open {opp.accountName}
            </button>
          )}
          <button className="td-sheet-btn is-danger" onClick={onDelete}>
            Delete Opportunity
          </button>
        </div>
      </div>
    </div>
  );
}


/* ---------- Photos linked to an opportunity (Nov 19) ----------
   They're the customer's own photos (same ones on the profile; nothing is copied).
   Add New saves to the customer's photos AND links it; From Profile picks existing ones. */
function PhotoImg({ photo, className }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!photo || photo.broken) return undefined;
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return url ? <img className={className} src={url} alt="" /> : <span className={`${className} op-img-blank`} />;
}

function OppPhotos({ customer, photoIds, setPhotoIds }) {
  const key = photoKey('customer', customer.id);
  const [photos, setPhotos] = useState([]); // all of this customer's photos
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const load = () =>
    listPhotos(key)
      .then((rows) => Promise.all(rows.map(inMemory)))
      .then(setPhotos)
      .catch(() => setMsg("Photos aren't available in this browser."));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const linked = photoIds.map((id) => photos.find((p) => p.id === id)).filter(Boolean); // deleted photos just drop off
  const toggle = (id) => setPhotoIds(photoIds.includes(id) ? photoIds.filter((x) => x !== id) : [...photoIds, id]);

  const pickNew = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setMsg('');
    try {
      const added = await addPhotos(key, files);
      await load();
      setPhotoIds([...photoIds, ...added.map((p) => p.id)]);
    } catch (err) {
      setMsg(err.message || "Couldn't save that photo.");
    }
    setBusy(false);
  };

  return (
    <div className="op-photos">
      <div className="op-photos-head">
        <span>Photos</span>
        <span className="op-seg">
          <button className="td-chip" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
            <IoCameraOutline className="op-chip-icon" /> {busy ? 'Saving…' : 'Add New'}
          </button>
          <button className="td-chip" disabled={!photos.length} onClick={() => setPicking(true)}>
            From Profile
          </button>
        </span>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="op-file" onChange={pickNew} />
      {linked.length > 0 && (
        <div className="op-strip">
          {linked.map((p) => (
            <span key={p.id} className="op-strip-item">
              <button className="op-thumb" onClick={() => setViewing(p)} aria-label="View photo">
                <PhotoImg photo={p} className="op-thumb-img" />
              </button>
              <button className="op-unlink" onClick={() => toggle(p.id)} aria-label="Unlink photo">
                <IoClose />
              </button>
            </span>
          ))}
        </div>
      )}
      {msg && <div className="op-photo-msg">{msg}</div>}

      {picking && (
        <div className="op-picker" onClick={() => setPicking(false)}>
          <div className="op-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="td-sheet-top">
              <span />
              <div className="td-sheet-title">{customer.name}</div>
              <button className="td-link td-bold" onClick={() => setPicking(false)}>Done</button>
            </div>
            <div className="op-picker-grid">
              {photos.map((p) => {
                const on = photoIds.includes(p.id);
                return (
                  <button key={p.id} className={`op-pick ${on ? 'is-on' : ''}`} onClick={() => toggle(p.id)}>
                    <PhotoImg photo={p} className="op-thumb-img" />
                    <span className="op-pick-mark">{on && <IoCheckmark />}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="ap-viewer" onClick={() => setViewing(null)}>
          <div className="ap-viewer-top" onClick={(e) => e.stopPropagation()}>
            <button className="ap-icon" onClick={() => setViewing(null)} aria-label="Close">
              <IoClose />
            </button>
            <div className="ap-viewer-title">
              <strong>{customer.name}</strong>
            </div>
            <span style={{ width: 38 }} />
          </div>
          <PhotoImg photo={viewing} className="ap-viewer-img" />
        </div>
      )}
    </div>
  );
}
