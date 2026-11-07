// Crumb Admin, step 1: sign-in (admins only), Overview and Users. Read-only.
// Shows counts, dates, emails and device counts only, never reps' customers, notes or photos.
import React, { useCallback, useEffect, useState } from 'react';
import { cloud, cloudReady, cloudProblem, plainError, projectRef } from './cloud.js';

const TAB_KEY = 'crumb_admin_tab';
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || 'overview'; } catch { return 'overview'; } };
const saveTab = (t) => { try { localStorage.setItem(TAB_KEY, t); } catch { /* not important */ } };

// ---------- time words ----------
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
function ago(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < MIN) return 'Just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  if (ms < 2 * DAY) return 'Yesterday';
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)} days ago`;
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
      <h1 className="ad-h1">Sign in</h1>
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

function Overview({ data, onSignOut, email }) {
  const attention = [];
  if (data.needs_review > 0) attention.push(`${data.needs_review} sync ${data.needs_review === 1 ? 'change needs' : 'changes need'} review`);
  return (
    <>
      <h1 className="ad-h1">How's the business?</h1>
      <div className="ad-grid">
        <Tile label="Registered users" value={data.users_total} sub={data.users_new_7d ? `${data.users_new_7d} new this week` : 'None new this week'} />
        <Tile label="Active this week" value={data.users_active_7d} sub="Synced a change" />
        <Tile label="Devices syncing" value={data.devices_30d} sub="Last 30 days" />
        <Tile label="Changes today" value={data.changes_24h} sub={`${data.changes_7d} this week`} />
      </div>

      <h2 className={`ad-h2 ${attention.length ? 'ad-h2-warn' : ''}`}>{attention.length ? 'Needs your attention' : 'Sync'}</h2>
      <div className="ad-card ad-rows">
        {attention.map((a) => <div key={a} className="ad-row ad-row-warn"><span className="ad-dot ad-dot-warn" /><span className="ad-row-label">{a}</span></div>)}
        <div className="ad-row"><span className="ad-dot ad-dot-ok" /><span className="ad-row-label">Last change synced</span><span className="ad-row-value">{ago(data.last_change_at)}</span></div>
        <div className="ad-row"><span className="ad-dot ad-dot-ok" /><span className="ad-row-label">Overwritten values kept (7 days)</span><span className="ad-row-value">{data.overwrites_7d}</span></div>
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
              <span>Type the email to confirm</span>
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

const ACTION_WORDS = { delete_account: 'Deleted' };

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
        <input type="search" placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by email" />
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
              <div><span>Last sign-in</span><b>{ago(u.last_sign_in_at)}</b></div>
              <div><span>Last change</span><b>{ago(u.last_change_at)}</b></div>
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
          <h2 className="ad-h2">Recent admin actions</h2>
          <div className="ad-card ad-rows">
            {log.map((l, i) => (
              <div className="ad-row ad-log" key={`${l.at}-${i}`}>
                <span className="ad-row-label">{ACTION_WORDS[l.action] || l.action} {l.target_email}</span>
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

// ---------- app ----------
export default function App() {
  const [stage, setStage] = useState('loading'); // loading | signedOut | notAdmin | ready | error
  const [tab, setTab] = useState(readTab);
  const [email, setEmail] = useState('');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [log, setLog] = useState([]);
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
    try { await cloud().auth.signOut(); } catch { /* signed out locally anyway */ }
    setOverview(null); setUsers([]); setStage('signedOut');
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
        <h1 className="ad-h1">Not an admin</h1>
        <p className="ad-muted">{email} isn't allowed into Crumb Admin.</p>
        <button className="ad-btn" type="button" onClick={signOut}>Sign Out</button>
      </main>
    );
  }
  if (stage === 'error') {
    return (
      <main className="ad-page">
        <Brand />
        <h1 className="ad-h1">Couldn't load</h1>
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
        {tab === 'overview' && overview && <Overview data={overview} email={email} onSignOut={signOut} />}
        {tab === 'users' && <Users users={users} log={log} onChanged={load} />}
        {tab === 'health' && <ComingNext title="Platform Health" lines={['Database and last backup', 'Sync errors and stuck changes', 'Reminders and email service', 'Cost vs plan']} />}
        {tab === 'inbox' && <ComingNext title="Inbox" lines={['Tickets from Report A Problem', 'Suggestions from Make A Suggestion', 'Push alert to your phone for urgent tickets']} />}
      </main>

      <nav className="ad-tabs" aria-label="Admin sections">
        {[['overview', 'Overview'], ['users', 'Users'], ['health', 'Health'], ['inbox', 'Inbox']].map(([id, label]) => (
          <button key={id} type="button" className={`ad-tab ${tab === id ? 'is-on' : ''}`} onClick={() => pick(id)} aria-current={tab === id ? 'page' : undefined}>
            {Icon[id]}<span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
