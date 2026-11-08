// Crumb Admin, step 1: sign-in (admins only), Overview and Users. Read-only.
// Shows counts, dates, emails and device counts only, never reps' customers, notes or photos.
import React, { useCallback, useEffect, useState } from 'react';
import { cloud, cloudReady, cloudProblem, plainError, projectRef, signOutThisDevice } from './cloud.js';

const TAB_KEY = 'crumb_admin_tab';
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || 'overview'; } catch { return 'overview'; } };
const saveTab = (t) => { try { localStorage.setItem(TAB_KEY, t); } catch { /* not important */ } };

// ---------- time words ----------
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
function ago(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < MIN) return 'Just Now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)} Min Ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} Hr Ago`;
  if (ms < 2 * DAY) return 'Yesterday';
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)} Days Ago`;
  return shortDate(iso);
}
function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
const todayLabel = () => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// ---------- icons ----------
const Icon = {
  overview: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  users: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-2.8-1.7-5.1-4.2-6" /></svg>,
  health: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>,
  inbox: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>,
};

function Brand() {
  return (
    <div className="ad-brand">
      <span className="ad-brand-crumb">Crumb.</span>
      <span className="ad-brand-admin">ADMIN</span>
    </div>
  );
}

// ---------- sign in ----------
function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const { error } = await cloud().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      onSignedIn();
    } catch (err) {
      setMsg(plainError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="ad-page ad-signin">
      <Brand />
      <h1 className="ad-h1">Sign In</h1>
      <p className="ad-muted">For Crumb admins only. Use your Crumb account.</p>
      <form className="ad-card ad-form" onSubmit={submit}>
        <label className="ad-field">
          <span>Email</span>
          <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="ad-field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="ad-btn" type="submit" disabled={busy}>{busy ? 'Signing In…' : 'Sign In'}</button>
        {msg && <p className="ad-error" role="alert">{msg}</p>}
      </form>
    </main>
  );
}

// ---------- overview ----------
function Tile({ label, value, sub }) {
  return (
    <div className="ad-tile">
      <span className="ad-tile-label">{label}</span>
      <span className="ad-tile-value">{value}</span>
      {sub && <span className="ad-tile-sub">{sub}</span>}
    </div>
  );
}

function Overview({ data, onSignOut, email, newTickets = 0, newSuggestions = 0, newBeta = 0, onOpenInbox }) {
  const attention = [];
  if (newTickets > 0) attention.push(`${newTickets} New ${newTickets === 1 ? 'Ticket' : 'Tickets'} In The Inbox`);
  if (newSuggestions > 0) attention.push(`${newSuggestions} New ${newSuggestions === 1 ? 'Suggestion' : 'Suggestions'} In The Inbox`);
  if (newBeta > 0) attention.push(`${newBeta} New Beta ${newBeta === 1 ? 'Sign-Up' : 'Sign-Ups'} In The Inbox`);
  if (data.needs_review > 0) attention.push(`${data.needs_review} Sync ${data.needs_review === 1 ? 'Change Needs' : 'Changes Need'} Review`);
  return (
    <>
      <h1 className="ad-h1">How's The Business?</h1>
      <div className="ad-grid">
        <Tile label="Registered Users" value={data.users_total} sub={data.users_new_7d ? `${data.users_new_7d} New This Week` : 'None New This Week'} />
        <Tile label="Active This Week" value={data.users_active_7d} sub="Synced A Change" />
        <Tile label="Devices Syncing" value={data.devices_30d} sub="Last 30 Days" />
        <Tile label="Changes Today" value={data.changes_24h} sub={`${data.changes_7d} This Week`} />
      </div>

      <h2 className={`ad-h2 ${attention.length ? 'ad-h2-warn' : ''}`}>{attention.length ? 'Needs Your Attention' : 'Sync'}</h2>
      <div className="ad-card ad-rows">
        {attention.map((a) => (
          <button key={a} type="button" className="ad-row ad-row-warn ad-row-btn" onClick={/Inbox/.test(a) ? onOpenInbox : undefined}>
            <span className="ad-dot ad-dot-warn" /><span className="ad-row-label">{a}</span>
          </button>
        ))}
        <div className="ad-row"><span className="ad-dot ad-dot-ok" /><span className="ad-row-label">Last Change Synced</span><span className="ad-row-value">{ago(data.last_change_at)}</span></div>
        <div className="ad-row"><span className="ad-dot ad-dot-ok" /><span className="ad-row-label">Overwritten Values Kept (7 Days)</span><span className="ad-row-value">{data.overwrites_7d}</span></div>
      </div>

      <div className="ad-account">
        <span className="ad-muted">Signed in as {email}{projectRef ? ` · ${projectRef}` : ''}</span>
        <button className="ad-link-btn" type="button" onClick={onSignOut}>Sign Out</button>
      </div>
    </>
  );
}

// ---------- delete account (guardrails: counts first, type the email, server re-checks everything) ----------
function DeleteSheet({ email, onClose, onDeleted }) {
  const [fp, setFp] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let live = true;
    cloud().rpc('admin_user_footprint', { p_email: email }).then(({ data, error }) => {
      if (!live) return;
      if (error) setMsg(plainError(error)); else setFp(data);
    });
    return () => { live = false; };
  }, [email]);

  const matches = typed.trim().toLowerCase() === String(email).toLowerCase();
  const blocked = fp && (fp.is_self || fp.is_admin || !fp.found);
  const items = fp ? [
    ['accounts', 'customer or prospect', 'customers & prospects'], ['notes', 'note', 'notes'],
    ['events', 'calendar event', 'calendar events'], ['stops', 'itinerary stop', 'itinerary stops'],
    ['todos', 'to-do', 'to-dos'], ['photos', 'photo', 'photos'],
  ].filter(([k]) => fp[k] > 0).map(([k, one, many]) => `${fp[k]} ${fp[k] === 1 ? one : many}`) : [];

  const del = async () => {
    if (!matches || busy) return;
    setBusy(true); setMsg('');
    const { data, error } = await cloud().rpc('admin_delete_user', { p_email: email, p_confirm: typed });
    setBusy(false);
    if (error) { setMsg(plainError(error)); return; }
    onDeleted(data);
  };

  return (
    <div className="ad-sheet-back" onClick={busy ? undefined : onClose}>
      <div className="ad-sheet" role="dialog" aria-modal="true" aria-labelledby="ad-del-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ad-del-title" className="ad-sheet-title">Delete Account?</h2>
        <p className="ad-sheet-email">{email}</p>
        {!fp && !msg && <p className="ad-muted">Checking what this account has…</p>}
        {fp && blocked && <p className="ad-error">{!fp.found ? 'This account no longer exists.' : fp.is_self ? "You can't delete your own account here." : "Admins can't be deleted here."}</p>}
        {fp && !blocked && (
          <>
            <div className={`ad-sheet-box ${items.length ? 'is-warn' : ''}`}>
              {items.length
                ? <><b>This also deletes their cloud data:</b><ul>{items.map((t) => <li key={t}>{t}</li>)}</ul></>
                : <b>This account has no data in the cloud.</b>}
            </div>
            <p className="ad-muted ad-small">This can't be undone. Any phone they use keeps its own copy until the app is removed.</p>
            <label className="ad-field">
              <span>Type The Email To Confirm</span>
              <input type="email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} />
            </label>
            <button className="ad-btn ad-btn-danger" type="button" disabled={!matches || busy} onClick={del}>{busy ? 'Deleting…' : 'Delete Account'}</button>
          </>
        )}
        {msg && <p className="ad-error" role="alert">{msg}</p>}
        <button className="ad-link-btn ad-sheet-cancel" type="button" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function logText(l) {
  const d = l.details || {};
  if (l.action === 'delete_account') return `Deleted ${l.target_email}`;
  if (l.action === 'beta_status') return `Beta ${l.target_email} → ${betaWord(d.to)}`;
  if (l.action === 'feedback_status') return `${d.kind === 'suggestion' ? 'Suggestion' : 'Ticket'} #${d.id} → ${statusWord(d.kind === 'suggestion' ? 'suggestion' : 'problem', d.to)}`;
  return `${l.action} ${l.target_email || ''}`;
}

// ---------- users ----------
function Users({ users, log, onChanged }) {
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState('');
  const [done, setDone] = useState('');
  const [filter, setFilter] = useState('all');
  const active = (u) => u.last_change_at && Date.now() - new Date(u.last_change_at).getTime() < 7 * DAY;
  const shown = users
    .filter((u) => (filter === 'active' ? active(u) : true))
    .filter((u) => !q.trim() || String(u.email || '').toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <h1 className="ad-h1">Users</h1>
      {done && <p className="ad-done" role="status">{done}</p>}
      <label className="ad-search">
        {Icon.search}
        <input type="search" placeholder="Search By Email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search By Email" />
      </label>
      <div className="ad-chips" role="group" aria-label="Filter users">
        <button type="button" className={`ad-chip ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setFilter('all')}>All · {users.length}</button>
        <button type="button" className={`ad-chip ${filter === 'active' ? 'is-on' : ''}`} onClick={() => setFilter('active')}>Active · {users.filter(active).length}</button>
      </div>

      <div className="ad-list">
        {shown.map((u) => (
          <div className="ad-user" key={u.email}>
            <div className="ad-user-top">
              <div className="ad-avatar" aria-hidden="true">{String(u.email || '?').charAt(0).toUpperCase()}</div>
              <div className="ad-user-name">
                <div className="ad-user-email">{u.email}</div>
                <div className="ad-muted ad-small">{u.is_admin ? 'Admin' : 'Rep'} · Joined {shortDate(u.joined_at)}</div>
              </div>
              <span className={`ad-pill ${active(u) ? 'ad-pill-ok' : 'ad-pill-quiet'}`}>{active(u) ? 'ACTIVE' : 'QUIET'}</span>
            </div>
            <div className="ad-user-stats">
              <div><span>Last Sign-In</span><b>{ago(u.last_sign_in_at)}</b></div>
              <div><span>Last Change</span><b>{ago(u.last_change_at)}</b></div>
              <div><span>Devices</span><b>{u.devices_30d}</b></div>
            </div>
            {!u.is_admin && <button type="button" className="ad-del-btn" onClick={() => { setDone(''); setDeleting(u.email); }}>Delete Account</button>}
          </div>
        ))}
        {shown.length === 0 && <p className="ad-muted">No one matches.</p>}
      </div>
      <p className="ad-muted ad-small ad-note">Counts and dates only. Admin never shows reps' customers, notes or photos.</p>

      {log.length > 0 && (
        <>
          <h2 className="ad-h2">Recent Admin Actions</h2>
          <div className="ad-card ad-rows">
            {log.map((l, i) => (
              <div className="ad-row ad-log" key={`${l.at}-${i}`}>
                <span className="ad-row-label">{logText(l)}</span>
                <span className="ad-row-value">{ago(l.at)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {deleting && (
        <DeleteSheet
          email={deleting}
          onClose={() => setDeleting('')}
          onDeleted={(r) => { setDeleting(''); setDone(`Deleted ${r.email}.`); onChanged(); }}
        />
      )}
    </>
  );
}

function ComingNext({ title, lines }) {
  return (
    <>
      <h1 className="ad-h1">{title}</h1>
      <div className="ad-card ad-coming">
        <span className="ad-pill ad-pill-quiet">COMING NEXT</span>
        <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
    </>
  );
}

// ---------- platform health ----------
const CRM_URL = String(import.meta.env.VITE_CRM_URL || 'https://crumb-v3.vercel.app').replace(/\/+$/, '');
const GB = 1024 ** 3;
const LIMITS = { db: 8 * GB, files: 100 * GB, users: 100000 }; // Supabase Pro plan quotas
// Sign-in and password emails go out from Crumb's own domain (set up Nov 7 in Supabase).
const EMAIL_STATUS = { level: 'ok', text: 'Working', sub: 'Sending From crumbsales.com' };

function size(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < GB) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

function HealthRow({ level, label, value, sub, href }) {
  const inner = (
    <>
      <span className={`ad-dot ad-dot-${level}`} />
      <span className="ad-health-text">
        <span className="ad-row-label">{label}</span>
        {sub && <span className="ad-health-sub">{sub}</span>}
      </span>
      <span className="ad-row-value">{value}</span>
    </>
  );
  return href
    ? <a className="ad-row ad-health-row ad-row-link" href={href} target="_blank" rel="noreferrer">{inner}</a>
    : <div className="ad-row ad-health-row">{inner}</div>;
}

function Meter({ label, used, limit, text }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="ad-meter">
      <div className="ad-meter-top"><span>{label}</span><span className="ad-muted ad-small">{text}</span></div>
      <div className="ad-meter-bar"><div className={`ad-meter-fill ${pct > 80 ? 'is-high' : ''}`} style={{ width: `${Math.max(pct, used > 0 ? 1.5 : 0)}%` }} /></div>
    </div>
  );
}

function Health({ db, dbMs, dbErr, rem, remErr }) {
  const tickAge = rem && rem.last_tick_at ? Date.now() - new Date(rem.last_tick_at).getTime() : null;
  const remLevel = remErr ? 'warn' : !rem || !rem.last_tick_at ? 'warn' : rem.last_tick_ok === false ? 'bad' : tickAge > 15 * MIN ? 'bad' : 'ok';
  const remValue = remErr ? "Couldn't check" : !rem || !rem.last_tick_at ? 'No Run Yet' : rem.last_tick_ok === false ? 'Failed' : `Ran ${ago(rem.last_tick_at)}`;
  const remSub = remErr ? remErr
    : rem && rem.last_tick_ok === false ? rem.last_error
    : rem ? `${rem.devices} ${rem.devices === 1 ? 'Device Gets' : 'Devices Get'} Reminders` : '';
  const backupsHref = projectRef ? `https://supabase.com/dashboard/project/${projectRef}/database/backups/scheduled` : undefined;

  return (
    <>
      <h1 className="ad-h1">Platform Health</h1>
      <div className="ad-card ad-rows">
        <HealthRow level={dbErr ? 'bad' : 'ok'} label="Database" value={dbErr ? 'Problem' : 'Running'} sub={dbErr || (dbMs != null ? `Answered In ${dbMs} ms` : '')} />
        <HealthRow level="info" label="Backups" value="Check ›" sub="Daily On Supabase Pro · Opens Supabase" href={backupsHref} />
        <HealthRow level={remLevel} label="Reminders" value={remValue} sub={remSub} />
        <HealthRow level={EMAIL_STATUS.level} label="Email Service" value={EMAIL_STATUS.text} sub={EMAIL_STATUS.sub} />
        {db && <HealthRow level={db.needs_review > 0 ? 'warn' : 'ok'} label="Sync" value={db.needs_review > 0 ? `${db.needs_review} To Review` : 'No Problems'} sub={`${db.changes_24h} Changes Today · Last ${ago(db.last_change_at)}`} />}
      </div>

      {db && (
        <>
          <h2 className="ad-h2">Usage Vs Plan</h2>
          <div className="ad-card ad-meters">
            <Meter label="Database" used={db.db_size_bytes} limit={LIMITS.db} text={`${size(db.db_size_bytes)} Of 8 GB`} />
            <Meter label="Photo Storage" used={db.storage_bytes} limit={LIMITS.files} text={`${size(db.storage_bytes)} Of 100 GB · ${db.storage_files} ${db.storage_files === 1 ? 'Photo' : 'Photos'}`} />
            <Meter label="Users Signed In (30 Days)" used={db.users_signed_in_30d} limit={LIMITS.users} text={`${db.users_signed_in_30d} Of 100,000`} />
          </div>
          <p className="ad-muted ad-small ad-note">Supabase Pro, $25 a month, spend cap on. Going over a limit can make Crumb slow or read-only, but never adds charges while the spend cap is on.</p>
        </>
      )}
    </>
  );
}

// ---------- inbox: tickets + suggestions ----------
const STATUSES = {
  problem: [['new', 'New'], ['investigating', 'Investigating'], ['in_progress', 'In Progress'], ['resolved', 'Resolved'], ['closed', 'Closed']],
  suggestion: [['new', 'New'], ['exploring', 'Exploring'], ['approved', 'Approved'], ['postponed', 'Postponed'], ['declined', 'Declined']],
};
const DONE = new Set(['resolved', 'closed', 'approved', 'postponed', 'declined']);
const statusWord = (kind, st) => (STATUSES[kind].find(([v]) => v === st) || [st, st])[1];
const pillTone = (st) => (st === 'new' ? 'ad-pill-new' : DONE.has(st) ? 'ad-pill-quiet' : 'ad-pill-work');

function StatusSheet({ item, onClose, onSaved }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const pick = async (st) => {
    if (busy) return;
    setBusy(st); setMsg('');
    const { error } = await cloud().rpc('admin_feedback_set_status', { p_id: item.id, p_status: st });
    setBusy('');
    if (error) { setMsg(plainError(error)); return; }
    onSaved();
  };
  return (
    <div className="ad-sheet-back" onClick={busy ? undefined : onClose}>
      <div className="ad-sheet" role="dialog" aria-modal="true" aria-labelledby="ad-st-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ad-st-title" className="ad-sheet-title">{item.kind === 'problem' ? `Ticket #${item.id}` : `Suggestion #${item.id}`}</h2>
        <p className="ad-sheet-quote">{item.message}</p>
        <p className="ad-muted ad-small">{[item.area, item.email, item.device, item.app_version && `v ${item.app_version}`, shortDate(item.created_at)].filter(Boolean).join(' · ')}</p>
        <div className="ad-status-list" role="group" aria-label="Status">
          {STATUSES[item.kind].map(([v, label]) => (
            <button key={v} type="button" className={`ad-status-btn ${item.status === v ? 'is-on' : ''}`} disabled={Boolean(busy)} onClick={() => pick(v)}>
              {busy === v ? 'Saving…' : label}{item.status === v ? ' ✓' : ''}
            </button>
          ))}
        </div>
        {msg && <p className="ad-error" role="alert">{msg}</p>}
        <button className="ad-link-btn ad-sheet-cancel" type="button" onClick={onClose} disabled={Boolean(busy)}>Close</button>
      </div>
    </div>
  );
}

// ---------- beta sign-ups (from crumbsales.com) ----------
const BETA_STATUSES = [['new', 'New'], ['invited', 'Invited'], ['declined', 'Declined']];
const betaWord = (st) => (BETA_STATUSES.find(([v]) => v === st) || [st, st])[1];

function BetaSheet({ item, onClose, onSaved }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const pick = async (st) => {
    if (busy) return;
    setBusy(st); setMsg('');
    const { error } = await cloud().rpc('admin_beta_set_status', { p_id: item.id, p_status: st });
    setBusy('');
    if (error) { setMsg(plainError(error)); return; }
    onSaved();
  };
  return (
    <div className="ad-sheet-back" onClick={busy ? undefined : onClose}>
      <div className="ad-sheet" role="dialog" aria-modal="true" aria-labelledby="ad-beta-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ad-beta-title" className="ad-sheet-title">{item.name}</h2>
        <p className="ad-sheet-email">{item.email}</p>
        <p className="ad-muted ad-small">{[item.company, `Joined ${shortDate(item.created_at)}`].filter(Boolean).join(' · ')}</p>
        <div className="ad-status-list" role="group" aria-label="Status">
          {BETA_STATUSES.map(([v, label]) => (
            <button key={v} type="button" className={`ad-status-btn ${item.status === v ? 'is-on' : ''}`} disabled={Boolean(busy)} onClick={() => pick(v)}>
              {busy === v ? 'Saving…' : label}{item.status === v ? ' ✓' : ''}
            </button>
          ))}
        </div>
        <p className="ad-muted ad-small">Marking Invited only keeps track. Send the invite yourself for now.</p>
        {msg && <p className="ad-error" role="alert">{msg}</p>}
        <button className="ad-link-btn ad-sheet-cancel" type="button" onClick={onClose} disabled={Boolean(busy)}>Close</button>
      </div>
    </div>
  );
}

function Inbox({ items, err, beta = [], betaErr = '', onChanged }) {
  const [kind, setKind] = useState('problem');
  const [open, setOpen] = useState(null);
  const [openBeta, setOpenBeta] = useState(null);
  const list = items.filter((i) => i.kind === kind);
  const openCount = (k) => (k === 'beta' ? beta.filter((b) => b.status === 'new').length : items.filter((i) => i.kind === k && !DONE.has(i.status)).length);
  const sorted = [...list].sort((a, b) => (DONE.has(a.status) - DONE.has(b.status)) || (new Date(b.created_at) - new Date(a.created_at)));
  return (
    <>
      <h1 className="ad-h1">Inbox</h1>
      <div className="ad-seg" role="tablist">
        {[['problem', 'Tickets'], ['suggestion', 'Suggestions'], ['beta', 'Beta']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`ad-seg-btn ${kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>
            {label}{openCount(k) ? ` · ${openCount(k)}` : ''}
          </button>
        ))}
      </div>
      {kind === 'beta' ? (
        <>
          {betaErr && <p className="ad-error">{betaErr}</p>}
          <div className="ad-list">
            {beta.map((b) => (
              <button key={b.id} type="button" className={`ad-ticket ${b.status === 'new' ? 'is-new' : ''} ${b.status === 'declined' ? 'is-done' : ''} ${b.status === 'invited' ? 'is-invited' : ''}`} onClick={() => setOpenBeta(b)}>
                <span className="ad-ticket-top">
                  <span className="ad-muted ad-small">{b.company || 'No Company Given'}</span>
                  <span className={`ad-pill ${b.status === 'new' ? 'ad-pill-new' : b.status === 'invited' ? 'ad-pill-ok' : 'ad-pill-quiet'}`}>{betaWord(b.status).toUpperCase()}</span>
                </span>
                <span className="ad-ticket-msg">{b.name}</span>
                <span className="ad-muted ad-small">{b.email} · {ago(b.created_at)}</span>
              </button>
            ))}
            {!betaErr && beta.length === 0 && <div className="ad-card ad-coming"><p>No beta sign-ups yet. They come from the Join The Beta form on crumbsales.com.</p></div>}
          </div>
          {openBeta && <BetaSheet item={openBeta} onClose={() => setOpenBeta(null)} onSaved={() => { setOpenBeta(null); onChanged(); }} />}
        </>
      ) : (
      <>
      {err && <p className="ad-error">{err}</p>}
      <div className="ad-list">
        {sorted.map((i) => (
          <button key={i.id} type="button" className={`ad-ticket ${DONE.has(i.status) ? 'is-done' : ''} ${i.status === 'new' ? 'is-new' : ''}`} onClick={() => setOpen(i)}>
            <span className="ad-ticket-top">
              <span className="ad-muted ad-small">#{i.id}{i.area ? ` · ${i.area}` : ''}</span>
              <span className={`ad-pill ${pillTone(i.status)}`}>{statusWord(i.kind, i.status).toUpperCase()}</span>
            </span>
            <span className="ad-ticket-msg">{i.message}</span>
            <span className="ad-muted ad-small">{[i.email, i.device && i.device.split(' · ')[0], ago(i.created_at)].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
        {!err && sorted.length === 0 && (
          <div className="ad-card ad-coming"><p>{kind === 'problem' ? 'No tickets yet. Reps send them from Settings → Report A Problem.' : 'No suggestions yet. Reps send them from Settings → Make A Suggestion.'}</p></div>
        )}
      </div>
      {open && <StatusSheet item={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); onChanged(); }} />}
      </>
      )}
    </>
  );
}

// ---------- app ----------
export default function App() {
  const [stage, setStage] = useState('loading'); // loading | signedOut | notAdmin | ready | error
  const [tab, setTab] = useState(readTab);
  const [email, setEmail] = useState('');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [log, setLog] = useState([]);
  const [inbox, setInbox] = useState({ items: [], err: '', beta: [], betaErr: '' });
  const [health, setHealth] = useState({ db: null, dbMs: null, dbErr: '', rem: null, remErr: '' });
  const [msg, setMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const sb = cloud();
    if (!sb) { setStage('error'); return; }
    setRefreshing(true);
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setStage('signedOut'); return; }
      setEmail(session.user.email || '');
      const { data: isAdmin, error: adminErr } = await sb.rpc('is_admin');
      if (adminErr) throw adminErr;
      if (!isAdmin) { setStage('notAdmin'); return; }
      const [ov, us, lg] = await Promise.all([sb.rpc('admin_overview'), sb.rpc('admin_users'), sb.rpc('admin_log_recent', { p_limit: 10 })]);
      if (ov.error) throw ov.error;
      if (us.error) throw us.error;
      setOverview(ov.data);
      setUsers(us.data || []);
      setLog(lg.error ? [] : (lg.data || [])); // before step 2's SQL is run, there is simply no log yet
      // Platform Health: the database's own numbers, then the reminder system (the CRM's server).
      const t0 = performance.now();
      const hd = await sb.rpc('admin_health');
      const next = { db: hd.error ? null : hd.data, dbMs: Math.round(performance.now() - t0), dbErr: hd.error ? plainError(hd.error) : '', rem: null, remErr: '' };
      try {
        const r = await fetch(`${CRM_URL}/api/admin-health`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
        next.rem = body.reminders;
      } catch (err) {
        next.remErr = plainError(err);
      }
      setHealth(next);
      const fb = await sb.rpc('admin_feedback_list');
      const bt = await sb.rpc('admin_beta_list');
      setInbox({ items: fb.error ? [] : (fb.data || []), err: fb.error ? plainError(fb.error) : '', beta: bt.error ? [] : (bt.data || []), betaErr: bt.error ? plainError(bt.error) : '' });
      setMsg('');
      setStage('ready');
    } catch (err) {
      setMsg(plainError(err));
      setStage((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const signOut = async () => {
    await signOutThisDevice(); // this device only; other devices and the Crumb app stay signed in
    window.location.replace('/'); // restart so nothing of the old sign-in stays in memory
  };

  const pick = (t) => { setTab(t); saveTab(t); window.scrollTo(0, 0); };

  if (!cloudReady || cloudProblem) {
    return (
      <main className="ad-page">
        <Brand />
        <div className="ad-card ad-coming"><p>Crumb Admin isn't connected to the cloud yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in this app's Vercel settings, then redeploy.</p>{cloudProblem && <p className="ad-error">{cloudProblem}</p>}</div>
      </main>
    );
  }
  if (stage === 'loading') return <main className="ad-page"><Brand /><p className="ad-muted">Loading…</p></main>;
  if (stage === 'signedOut') return <SignIn onSignedIn={load} />;
  if (stage === 'notAdmin') {
    return (
      <main className="ad-page">
        <Brand />
        <h1 className="ad-h1">Not An Admin</h1>
        <p className="ad-muted">{email} isn't allowed into Crumb Admin.</p>
        <button className="ad-btn" type="button" onClick={signOut}>Sign Out</button>
      </main>
    );
  }
  if (stage === 'error') {
    return (
      <main className="ad-page">
        <Brand />
        <h1 className="ad-h1">Couldn't Load</h1>
        <p className="ad-error">{msg}</p>
        <button className="ad-btn" type="button" onClick={load}>Try Again</button>
        <button className="ad-link-btn" type="button" onClick={signOut}>Sign Out</button>
      </main>
    );
  }

  return (
    <div className="ad-app">
      <main className="ad-page ad-with-tabs">
        <div className="ad-top">
          <Brand />
          <button className="ad-refresh" type="button" onClick={load} disabled={refreshing}>{refreshing ? 'Updating…' : todayLabel()}</button>
        </div>
        {msg && <p className="ad-error">{msg}</p>}
        {tab === 'overview' && overview && <Overview data={overview} email={email} onSignOut={signOut} newTickets={inbox.items.filter((i) => i.kind === 'problem' && i.status === 'new').length} newSuggestions={inbox.items.filter((i) => i.kind === 'suggestion' && i.status === 'new').length} newBeta={inbox.beta.filter((b) => b.status === 'new').length} onOpenInbox={() => pick('inbox')} />}
        {tab === 'users' && <Users users={users} log={log} onChanged={load} />}
        {tab === 'health' && <Health {...health} />}
        {tab === 'inbox' && <Inbox items={inbox.items} err={inbox.err} beta={inbox.beta} betaErr={inbox.betaErr} onChanged={load} />}
      </main>

      <nav className="ad-tabs" aria-label="Admin sections">
        {[['overview', 'Overview'], ['users', 'Users'], ['health', 'Health'], ['inbox', 'Inbox']].map(([id, label]) => (
          <button key={id} type="button" className={`ad-tab ${tab === id ? 'is-on' : ''}`} onClick={() => pick(id)} aria-current={tab === id ? 'page' : undefined}>
            <span className="ad-tab-icon">{Icon[id]}{id === 'inbox' && (inbox.items.some((i) => i.status === 'new') || inbox.beta.some((b) => b.status === 'new')) && <span className="ad-badge" aria-label="New items" />}</span><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
