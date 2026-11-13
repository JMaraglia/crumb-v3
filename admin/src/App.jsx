// Crumb Admin, step 1: sign-in (admins only), Overview and Users. Read-only.
// Shows counts, dates, emails and device counts only, never reps' customers, notes or photos.
import React, { useCallback, useEffect, useState } from 'react';
import { cloud, cloudReady, cloudProblem, plainError, projectRef, signOutThisDevice } from './cloud.js';

// Older tickets were filed under "Prospects"; the app now calls that section Pipeline (display only).
const areaLabel = (a) => (a === 'Prospects' ? 'Pipeline' : a === 'Itinerary' ? 'Daily Stops' : a); // display names only

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
// Founder, Nov 11: tapping a tile opens Users showing exactly who it counts.
function Tile({ label, value, sub, onClick }) {
  if (!onClick) {
    return (
      <div className="ad-tile">
        <span className="ad-tile-label">{label}</span>
        <span className="ad-tile-value">{value}</span>
        {sub && <span className="ad-tile-sub">{sub}</span>}
      </div>
    );
  }
  return (
    <button type="button" className="ad-tile ad-tile-btn" onClick={onClick}>
      <span className="ad-tile-label">{label}<span className="ad-tile-go" aria-hidden="true">›</span></span>
      <span className="ad-tile-value">{value}</span>
      {sub && <span className="ad-tile-sub">{sub}</span>}
    </button>
  );
}

function Overview({ data, users = [], onSignOut, email, newTickets = 0, newSuggestions = 0, newBeta = 0, onOpenInbox, onOpenUsers = () => {} }) {
  // Founder, Nov 11: the first three tiles count reps only (admins left out), matching the lists they open.
  const reps = users.filter((u) => !u.is_admin);
  const recent = (d, ms) => d && Date.now() - new Date(d).getTime() < ms;
  const repNew = reps.filter((u) => recent(u.joined_at, 7 * DAY)).length;
  const repActive = reps.filter((u) => recent(u.last_change_at, 7 * DAY)).length;
  const repDevices = reps.reduce((n, u) => n + (Number(u.devices_30d) || 0), 0);
  const attention = [];
  if (newTickets > 0) attention.push(`${newTickets} New ${newTickets === 1 ? 'Ticket' : 'Tickets'} In The Inbox`);
  if (newSuggestions > 0) attention.push(`${newSuggestions} New ${newSuggestions === 1 ? 'Suggestion' : 'Suggestions'} In The Inbox`);
  if (newBeta > 0) attention.push(`${newBeta} New Beta ${newBeta === 1 ? 'Sign-Up' : 'Sign-Ups'} In The Inbox`);
  if (data.needs_review > 0) attention.push(`${data.needs_review} Sync ${data.needs_review === 1 ? 'Change Needs' : 'Changes Need'} Review`);
  return (
    <>
      <h1 className="ad-h1">How's The Business?</h1>
      <div className="ad-grid">
        <Tile label="Registered Reps" value={reps.length} sub={repNew ? `${repNew} New This Week` : 'None New This Week'} onClick={() => onOpenUsers(repNew ? 'new' : 'all')} />
        <Tile label="Active This Week" value={repActive} sub="Synced A Change" onClick={() => onOpenUsers('active')} />
        <Tile label="Devices Syncing" value={repDevices} sub="Last 30 Days" onClick={() => onOpenUsers('devices')} />
        <Tile label="Changes Today" value={data.changes_24h} sub={`${data.changes_7d} This Week`} onClick={() => onOpenUsers('today')} />
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
// ---------- welcome email (sent by the CRM's server through Resend; admins only, approved emails only) ----------
// Nov 10: the server records every send. Approving (resend = false) never sends a second one;
// only Resend Welcome Email (resend = true, after a confirm) does. Returns { err, skipped, sentAt }.
async function sendWelcome(email, name = '', resend = false) {
  try {
    const sb = cloud();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { err: 'Signed out. Sign in again and resend from Sync Access.' };
    const r = await fetch(`${CRM_URL}/api/admin-invite-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, resend }),
      cache: 'no-store',
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { err: body.error || `Error ${r.status}` };
    return { err: '', skipped: Boolean(body.skipped), sentAt: body.sent_at || null, reason: body.reason || '' };
  } catch (err) {
    return { err: plainError(err) };
  }
}
const welcomeFor = (welcomes, email) =>
  (welcomes || []).find((w) => String(w.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
const welcomeLine = (w) => (w && w.times > 0 ? `Welcome Sent ${shortDate(w.last_sent_at)}${w.times > 1 ? ` (${w.times}×)` : ''}` : 'No Welcome Email Yet');
const nameFor = (beta, email) => {
  const b = (beta || []).find((x) => String(x.email || '').toLowerCase() === String(email || '').toLowerCase());
  return (b && b.name) || '';
};
const mailNote = (email, res) => {
  if (!res) return '';
  if (res.err) return ` The welcome email didn’t go out (${res.err}). Send it from Inbox → Beta → Sync Access.`;
  if (res.skipped) return res.reason === 'sending' ? ' A welcome email is already on its way.' : ` A welcome email already went out${res.sentAt ? ` ${shortDate(res.sentAt)}` : ''}, so it wasn’t sent again.`;
  return ` Welcome email sent to ${email}.`;
};

function WelcomeToggle({ on, setOn, disabled }) {
  return (
    <label className="ad-check">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} disabled={disabled} />
      <span>Send Welcome Email</span>
    </label>
  );
}

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
    ['events', 'calendar event', 'calendar events'], ['stops', 'daily stop', 'daily stops'],
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
  if (l.action === 'invite_add') return `Sync Access Added: ${l.target_email}`;
  if (l.action === 'invite_remove') return `Sync Access Removed: ${l.target_email}`;
  if (l.action === 'welcome_sent') return `${d.resend ? 'Welcome Resent' : 'Welcome Sent'}: ${l.target_email}`;
  if (l.action === 'feedback_status') return `${d.kind === 'suggestion' ? 'Suggestion' : 'Ticket'} #${d.id} → ${statusWord(d.kind === 'suggestion' ? 'suggestion' : 'problem', d.to)}`;
  return `${l.action} ${l.target_email || ''}`;
}

// Create Account answers (Nov 10; saved with each new account, read with admin_signup_answers).
// Same wording as the app's src/signupQuestions.js.
const COLD_HOW = { phone: 'Phone', in_person: 'In Person', both: 'Both' };
function answerLines(s) {
  if (!s || typeof s !== 'object') return [];
  return [
    `Active Customers: ${s.customers}`,
    `Annual Sales: ${s.annual_sales}`,
    `Cold Calls: ${s.cold_call ? `Yes${COLD_HOW[s.cold_call_how] ? ` (${COLD_HOW[s.cold_call_how]})` : ''}` : 'No'}`,
    `Daily Stops: ${s.daily_stops ? `Yes (${s.stops_per_day} A Day)` : 'No'}`,
    `Current CRM: ${s.crm}`,
  ];
}
const answersFor = (answers, email) =>
  ((answers || []).find((a) => String(a.email || '').toLowerCase() === String(email || '').toLowerCase()) || {}).answers || null;
function Answers({ data }) {
  const lines = answerLines(data);
  if (!lines.length) return null;
  return (
    <div className="ad-answers">
      {lines.map((l) => <div key={l} className="ad-small">{l}</div>)}
    </div>
  );
}

// ---------- send a nudge (founder, Nov 11): a push notification to one rep's devices ----------
const NUDGE_DEFAULT = 'Your customers and stops are right where you left them. Anything getting in your way? Tap to open Crumb.';
function Nudge({ email, last, onDone, big = false }) {
  const [open, setOpen] = useState(false);
  const [sentAt, setSentAt] = useState(null); // just now, before the next refresh
  const when = sentAt || last;
  const [text, setText] = useState(NUDGE_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    if (busy || !text.trim()) return;
    setBusy(true); setErr('');
    try {
      const sb = cloud();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error('Signed out. Sign in again.');
      const r = await fetch(`${CRM_URL}/api/admin-nudge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message: text.trim() }),
        cache: 'no-store',
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
      setOpen(false);
      if (body.sent > 0) setSentAt(new Date().toISOString());
      onDone(body.devices === 0
        ? `${email} doesn’t have Crumb notifications turned on, so nothing was sent.`
        : body.sent > 0 ? `Nudge sent to ${email} (${body.sent} ${body.sent === 1 ? 'device' : 'devices'}).` : `The nudge to ${email} didn’t go through. Try again later.`);
    } catch (e) {
      setErr(plainError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <div className={`ad-nudge-row ${big ? 'is-big' : ''}`}>
        <button type="button" className={big ? 'ad-btn' : 'ad-link-btn ad-nudge-btn'} onClick={() => { setErr(''); setOpen(true); }}>Send A Nudge</button>
        {when ? <span className="ad-muted ad-small">Last Nudged {shortDate(when)} · {ago(when)}</span> : big && <span className="ad-muted ad-small">Never Nudged</span>}
      </div>
    );
  }
  return (
    <div className="ad-nudge">
      <label className="ad-small ad-muted" htmlFor={`nudge-${email}`}>Push notification to this rep’s phone:</label>
      <textarea id={`nudge-${email}`} className="ad-nudge-text" rows={3} maxLength={160} value={text} onChange={(e) => setText(e.target.value)} />
      {err && <p className="ad-error" role="alert">{err}</p>}
      <span className="ad-resend-ask">
        <button type="button" className="ad-link-btn" onClick={send} disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        <button type="button" className="ad-link-btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </span>
    </div>
  );
}

// ---------- people (Nov 12): one list for sign-ups, invited people and accounts ----------
const lc = (e) => String(e || '').toLowerCase();
const STEPS = ['Signed Up', 'Invited', 'Account Created', 'Using Crumb'];
function Steps({ at }) {
  return (
    <div className="ad-steps" aria-label={`Step: ${STEPS[at]}`}>
      {STEPS.map((w, i) => <span key={w} className={i === at ? 'is-at' : i < at ? 'is-past' : ''}>{i > 0 && <em aria-hidden="true">→</em>}{w}</span>)}
    </div>
  );
}
// Access = the email is on the invite list. A beta sign-up is kept in step with it (Invited / Declined).
async function grantAccess(email, b) {
  const r = b ? await cloud().rpc('admin_beta_set_status', { p_id: b.id, p_status: 'invited' }) : await cloud().rpc('admin_sync_invite_add', { p_email: email });
  return r.error ? plainError(r.error) : '';
}
async function revokeAccess(email, b, inv) {
  if (b && b.status !== 'declined') {
    const r = await cloud().rpc('admin_beta_set_status', { p_id: b.id, p_status: 'declined' });
    if (r.error) return plainError(r.error);
  }
  if (inv && inv.source !== 'beta') {
    const r = await cloud().rpc('admin_sync_invite_remove', { p_email: email });
    if (r.error) return plainError(r.error);
  }
  return '';
}

// Someone with no account yet: a new sign-up, an invited person, or a declined sign-up.
function LeadSheet({ lead, welcome, answers, onClose, onDone }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [mail, setMail] = useState(true);
  const [asking, setAsking] = useState(false);
  const b = lead.beta;
  const sentBefore = Boolean(welcome && welcome.times > 0);
  const invite = async () => {
    if (busy) return;
    setBusy('invite'); setMsg('');
    const err = await grantAccess(lead.email, b);
    if (err) { setBusy(''); setMsg(err); return; }
    const res = mail && !sentBefore ? await sendWelcome(lead.email, lead.name) : null;
    setBusy('');
    onDone(`${lead.email} is invited.${mailNote(lead.email, res)}`);
  };
  const takeBack = async (word) => {
    if (busy) return;
    setBusy('remove'); setMsg('');
    const err = await revokeAccess(lead.email, b, lead.invite);
    setBusy('');
    if (err) { setMsg(err); return; }
    onDone(`${lead.email} ${word}.`);
  };
  const facts = b ? [['Industry', b.industry], ['State', b.state], ['Company', b.company], ['Heard About Crumb', b.heard]].filter(([, v]) => v) : [];
  return (
    <div className="ad-sheet-back" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="ad-sheet ad-rep-sheet" role="dialog" aria-label="Person details">
        <div className="ad-rep-head">
          <span className="ad-urow-av" aria-hidden="true">{String(lead.name || lead.email || '?').charAt(0).toUpperCase()}</span>
          <div className="ad-urow-text">
            <h2 className="ad-sheet-title">{lead.name || lead.email}</h2>
            {lead.name && <span className="ad-rep-email">{lead.email}</span>}
          </div>
        </div>
        {lead.stage === 'declined'
          ? <span className="ad-urow-st ad-rep-st is-quiet"><i aria-hidden="true" />Declined</span>
          : <Steps at={lead.stage === 'invited' ? 1 : 0} />}
        {facts.length > 0 && <div className="ad-rep-facts">{facts.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}
        <p className="ad-muted ad-small">{b ? `Signed Up ${ago(b.created_at)}` : `Added By Hand ${ago(lead.invite && lead.invite.added_at)}`}</p>
        <Answers data={answers} />
        {msg && <p className="ad-error" role="alert">{msg}</p>}
        {lead.stage !== 'invited' ? (
          <>
            <button type="button" className="ad-btn" onClick={invite} disabled={Boolean(busy)}>{busy === 'invite' ? 'Inviting…' : 'Invite To The Beta'}</button>
            {sentBefore ? <span className="ad-muted ad-small ad-center">{welcomeLine(welcome)}</span> : <WelcomeToggle on={mail} setOn={setMail} disabled={Boolean(busy)} />}
            <p className="ad-muted ad-small">Inviting lets this email create an account and use Crumb.</p>
            {lead.stage === 'needs' && <button type="button" className="ad-del-btn ad-rep-del" onClick={() => takeBack('was declined')} disabled={Boolean(busy)}>{busy === 'remove' ? 'Saving…' : 'Decline'}</button>}
          </>
        ) : (
          <>
            <p className="ad-muted ad-small">Invited. Waiting for them to create their account.</p>
            <div className="ad-rep-welcome">
              <ResendWelcome email={lead.email} name={lead.name} welcome={welcome} disabled={Boolean(busy)} onDone={(r) => (r.err ? setMsg(r.err) : onDone(r.note))} />
              <span className="ad-muted ad-small">{welcomeLine(welcome)}</span>
            </div>
            {asking ? (
              <span className="ad-resend-ask ad-center">
                <span className="ad-small">Take the invite back?</span>
                <button type="button" className="ad-link-btn ad-invite-yes" onClick={() => takeBack('is no longer invited')} disabled={Boolean(busy)}>{busy === 'remove' ? 'Removing…' : 'Yes, Remove'}</button>
                <button type="button" className="ad-link-btn" onClick={() => setAsking(false)} disabled={Boolean(busy)}>Cancel</button>
              </span>
            ) : (
              <button type="button" className="ad-del-btn ad-rep-del" onClick={() => setAsking(true)} disabled={Boolean(busy)}>Remove Invite</button>
            )}
          </>
        )}
        <button type="button" className="ad-link-btn ad-sheet-cancel" onClick={onClose} disabled={Boolean(busy)}>Close</button>
      </div>
    </div>
  );
}

// Invite an email that never filled in the sign-up form.
function InviteSheet({ beta, onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [mail, setMail] = useState(true);
  const send = async (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (busy || !em) return;
    setBusy(true); setMsg('');
    const b = (beta || []).find((x) => lc(x.email) === em) || null;
    const err = await grantAccess(em, b);
    if (err) { setBusy(false); setMsg(err); return; }
    const res = mail ? await sendWelcome(em, (b && b.name) || '') : null;
    setBusy(false);
    onDone(`${em} is invited.${mailNote(em, res)}`);
  };
  return (
    <div className="ad-sheet-back" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="ad-sheet ad-rep-sheet" role="dialog" aria-label="Invite someone" onSubmit={send}>
        <h2 className="ad-sheet-title">Invite Someone</h2>
        <p className="ad-muted ad-small">For someone who didn't fill in the Join The Beta form. Their email will be able to create an account and use Crumb.</p>
        <label className="ad-field">Email Address
          <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        </label>
        <WelcomeToggle on={mail} setOn={setMail} disabled={busy} />
        {msg && <p className="ad-error" role="alert">{msg}</p>}
        <button type="submit" className="ad-btn" disabled={busy || !email.trim()}>{busy ? 'Inviting…' : 'Invite To The Beta'}</button>
        <button type="button" className="ad-link-btn ad-sheet-cancel" onClick={onClose} disabled={busy}>Cancel</button>
      </form>
    </div>
  );
}

// ---------- users ----------
// Beta approval: a rep is approved when their email is on the Sync Access list (admins always pass).
// invitesOk = false when that list couldn't be read: then no approval status is shown at all, never a wrong one.
function Users({ users, log, invites = [], invitesOk = false, answers = [], nudged = {}, beta = [], welcomes = [], onChanged, initialFilter = 'all' }) {
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState('');
  const [done, setDone] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [openEmail, setOpenEmail] = useState(''); // the rep whose details sheet is open (Nov 12)
  const [sheetNote, setSheetNote] = useState('');
  const [inviting, setInviting] = useState(false);
  const [access, setAccess] = useState({ busy: '', ask: false, err: '', mail: true }); // Approve / Remove Access in the rep sheet
  const within = (d, ms) => d && Date.now() - new Date(d).getTime() < ms;
  // The Overview tiles' groups (Nov 11): joined this week, active this week, a device synced in 30 days, a change in
  // the last 24 hours. Founder, Nov 11: admins are left out of these (they're always active); they still show under All.
  const active = (u) => !u.is_admin && within(u.last_change_at, 7 * DAY);
  const isNew = (u) => !u.is_admin && within(u.joined_at, 7 * DAY);
  const syncing = (u) => !u.is_admin && Number(u.devices_30d) > 0;
  const today = (u) => !u.is_admin && within(u.last_change_at, DAY);
  const invited = new Set(invites.map((i) => String(i.email || '').toLowerCase()));
  const approved = (u) => u.is_admin || invited.has(String(u.email || '').toLowerCase());
  const waiting = (u) => invitesOk && !approved(u);
  const quiet = (u) => !u.is_admin && !active(u);
  const nameOf = (u) => nameFor(beta, u.email); // from their beta sign-up; blank if they never filled in that form
  const inviteFor = (email) => invites.find((i) => lc(i.email) === lc(email)) || null;
  const betaFor = (email) => beta.find((x) => lc(x.email) === lc(email)) || null;
  // Leads: people with no account yet. A sign-up is New, Invited or Declined; an email added by hand is Invited.
  const haveAccount = new Set(users.map((u) => lc(u.email)));
  const leads = [
    ...beta.filter((x) => !haveAccount.has(lc(x.email))).map((x) => ({ email: x.email, name: x.name || '', beta: x, invite: inviteFor(x.email), stage: x.status === 'invited' || inviteFor(x.email) ? 'invited' : x.status === 'declined' ? 'declined' : 'needs' })),
    ...invites.filter((i) => i.source !== 'founder' && !haveAccount.has(lc(i.email)) && !betaFor(i.email)).map((i) => ({ email: i.email, name: '', beta: null, invite: i, stage: 'invited' })),
  ];
  const turnedDown = (u) => (betaFor(u.email) || {}).status === 'declined'; // an account whose access was declined or taken away
  const hit = (email, name) => !q.trim() || `${email || ''} ${name || ''}`.toLowerCase().includes(q.trim().toLowerCase());
  const byActivity = { active, quiet, new: isNew, devices: syncing, today };
  const grouped = !byActivity[filter]; // All / Needs You / Invited / Using Crumb show the groups; the rest are plain lists of accounts
  const showGroup = (g) => filter === 'all' || filter === g || (g === 'needs' && filter === 'waiting');
  const groups = {
    needs: { leads: leads.filter((l) => l.stage === 'needs'), users: users.filter((u) => waiting(u) && !turnedDown(u)) },
    invited: { leads: leads.filter((l) => l.stage === 'invited'), users: [] },
    using: { leads: [], users: users.filter((u) => !waiting(u)) },
    declined: { leads: leads.filter((l) => l.stage === 'declined'), users: users.filter((u) => waiting(u) && turnedDown(u)) },
  };
  const count = (g) => groups[g].leads.length + groups[g].users.length;
  const shown = users.filter((u) => (byActivity[filter] ? byActivity[filter](u) : true)).filter((u) => hit(u.email, nameOf(u)));
  const openLead = openEmail && !users.some((u) => u.email === openEmail) ? leads.find((l) => l.email === openEmail) || null : null;
  const openUser = openEmail ? users.find((u) => u.email === openEmail) : null;
  const devicesWord = (u) => `${u.devices_30d} ${Number(u.devices_30d) === 1 ? 'Device' : 'Devices'}`;

  const open = (email) => { setDone(''); setSheetNote(''); setAccess({ busy: '', ask: false, err: '', mail: true }); setOpenEmail(email); };
  const userRow = (u) => {
    const lively = within(u.last_change_at, 7 * DAY);
    const tone = waiting(u) ? 'warn' : lively ? 'ok' : 'quiet';
    return (
      <button type="button" className="ad-urow" key={u.email} onClick={() => open(u.email)}>
        <span className="ad-urow-av" aria-hidden="true">{String(nameOf(u) || u.email || '?').charAt(0).toUpperCase()}</span>
        <span className="ad-urow-text">
          <span className="ad-urow-name">{nameOf(u) || u.email}</span>
          <span className="ad-urow-sub">{u.is_admin ? `Admin · ${devicesWord(u)}` : `${devicesWord(u)} · Joined ${shortDate(u.joined_at)}`}</span>
        </span>
        <span className={`ad-urow-st is-${turnedDown(u) && waiting(u) ? 'quiet' : tone}`}><i aria-hidden="true" />{tone === 'warn' ? (turnedDown(u) ? 'No Access' : 'Not Approved') : ago(u.last_change_at)}</span>
        <span className="ad-urow-go" aria-hidden="true">›</span>
      </button>
    );
  };
  const leadRow = (l) => {
    const where = l.beta ? [l.beta.industry, l.beta.state].filter(Boolean).join(' · ') : '';
    const sub = l.stage === 'invited' ? `Invited ${ago((l.invite && l.invite.added_at) || (l.beta && l.beta.updated_at))}` : where || (l.name ? l.email : 'No Details Given');
    const [tone, word] = l.stage === 'needs' ? ['new', 'New Sign-Up'] : l.stage === 'invited' ? ['warn', 'Waiting'] : ['quiet', 'Declined'];
    return (
      <button type="button" className="ad-urow" key={`lead-${l.email}`} onClick={() => open(l.email)}>
        <span className="ad-urow-av" aria-hidden="true">{String(l.name || l.email || '?').charAt(0).toUpperCase()}</span>
        <span className="ad-urow-text">
          <span className="ad-urow-name">{l.name || l.email}</span>
          <span className="ad-urow-sub">{sub}</span>
        </span>
        <span className={`ad-urow-st is-${tone}`}><i aria-hidden="true" />{word}</span>
        <span className="ad-urow-go" aria-hidden="true">›</span>
      </button>
    );
  };
  const approve = async (u) => {
    if (access.busy) return;
    setAccess((a) => ({ ...a, busy: 'approve', err: '' }));
    const err = await grantAccess(u.email, betaFor(u.email));
    if (err) { setAccess((a) => ({ ...a, busy: '', err })); return; }
    const w = welcomeFor(welcomes, u.email);
    const res = access.mail && !(w && w.times > 0) ? await sendWelcome(u.email, nameOf(u)) : null;
    setAccess((a) => ({ ...a, busy: '' }));
    setSheetNote(`${u.email} is approved.${mailNote(u.email, res)}`);
    onChanged();
  };
  const removeAccess = async (u) => {
    if (access.busy) return;
    setAccess((a) => ({ ...a, busy: 'remove', err: '' }));
    const err = await revokeAccess(u.email, betaFor(u.email), inviteFor(u.email));
    if (err) { setAccess((a) => ({ ...a, busy: '', err })); return; }
    setAccess((a) => ({ ...a, busy: '', ask: false }));
    setSheetNote(`${u.email} no longer has beta access. Their data wasn't touched.`);
    onChanged();
  };

  return (
    <>
      <div className="ad-people-top">
        <h1 className="ad-h1">People</h1>
        {invitesOk && <button type="button" className="ad-link-btn ad-people-add" onClick={() => { setDone(''); setInviting(true); }}>Invite Someone</button>}
      </div>
      {done && <p className="ad-done" role="status">{done}</p>}
      <label className="ad-search">
        {Icon.search}
        <input type="search" placeholder="Search By Name Or Email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search By Name Or Email" />
      </label>
      <div className="ad-chips ad-chips-line" role="group" aria-label="Filter users">
        {[['all', 'All', users.length + leads.length], ['needs', 'Needs You', count('needs')], ['invited', 'Invited', count('invited')], ['using', 'Using Crumb', count('using')],
          ['active', 'Active', users.filter(active).length], ['quiet', 'Quiet', users.filter(quiet).length], ['new', 'New', users.filter(isNew).length], ['devices', 'Syncing', users.filter(syncing).length], ['today', 'Today', users.filter(today).length]]
          .map(([id, label, n]) => (
            <button key={id} type="button" className={`ad-chip ${filter === id || (id === 'needs' && filter === 'waiting') ? 'is-on' : ''}`} onClick={() => setFilter(id)}>{label} · {n}</button>
          ))}
      </div>

      {grouped ? (
        <>
          {[['needs', 'Needs You', 'ad-h2-warn'], ['invited', 'Invited, No Account Yet', ''], ['using', 'Using Crumb', ''], ['declined', 'Declined Or Removed', '']].map(([g, title, tone]) => {
            if (!(g === 'declined' ? filter === 'all' : showGroup(g))) return null;
            const ls = groups[g].leads.filter((l) => hit(l.email, l.name));
            const us = groups[g].users.filter((u) => hit(u.email, nameOf(u)));
            if (!ls.length && !us.length) return null;
            return (
              <React.Fragment key={g}>
                <h2 className={`ad-h2 ${tone}`}>{title}</h2>
                <div className="ad-card ad-urows">{ls.map(leadRow)}{us.map(userRow)}</div>
              </React.Fragment>
            );
          })}
          {['needs', 'invited', 'using', 'declined'].every((g) => !(g === 'declined' ? filter === 'all' : showGroup(g)) || (!groups[g].leads.some((l) => hit(l.email, l.name)) && !groups[g].users.some((u) => hit(u.email, nameOf(u))))) && <p className="ad-muted">No one here.</p>}
        </>
      ) : (
        <>
          {shown.length > 0 && <div className="ad-card ad-urows">{shown.map(userRow)}</div>}
          {shown.length === 0 && <p className="ad-muted">No one matches.</p>}
        </>
      )}
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

      {openUser && (
        <div className="ad-sheet-back" onClick={(e) => { if (e.target === e.currentTarget) setOpenEmail(''); }}>
          <div className="ad-sheet ad-rep-sheet" role="dialog" aria-label="Rep details">
            <div className="ad-rep-head">
              <span className="ad-urow-av" aria-hidden="true">{String(nameOf(openUser) || openUser.email || '?').charAt(0).toUpperCase()}</span>
              <div className="ad-urow-text">
                <h2 className="ad-sheet-title">{nameOf(openUser) || openUser.email}</h2>
                {nameOf(openUser) && <span className="ad-rep-email">{openUser.email}</span>}
              </div>
            </div>
            <span className={`ad-urow-st ad-rep-st is-${invitesOk && waiting(openUser) ? 'warn' : within(openUser.last_change_at, 7 * DAY) ? 'ok' : 'quiet'}`}>
              <i aria-hidden="true" />
              {[openUser.is_admin ? 'Admin' : 'Rep', within(openUser.last_change_at, 7 * DAY) ? 'Active This Week' : 'Quiet', invitesOk && (waiting(openUser) ? 'Waiting For Approval' : 'Approved')].filter(Boolean).join(' · ')}
            </span>
            {!openUser.is_admin && <Steps at={openUser.last_change_at ? 3 : 2} />}
            <div className="ad-rep-facts">
              <div><span>Joined</span><b>{shortDate(openUser.joined_at)}</b></div>
              <div><span>Devices</span><b>{openUser.devices_30d}</b></div>
              <div><span>Last Sign-In</span><b>{ago(openUser.last_sign_in_at)}</b></div>
              <div><span>Last Change</span><b>{ago(openUser.last_change_at)}</b></div>
            </div>
            <Answers data={answersFor(answers, openUser.email)} />
            {sheetNote && <p className="ad-done" role="status">{sheetNote}</p>}
            {access.err && <p className="ad-error" role="alert">{access.err}</p>}
            {waiting(openUser) && (
              <>
                <button type="button" className="ad-btn" onClick={() => approve(openUser)} disabled={Boolean(access.busy)}>{access.busy === 'approve' ? 'Approving…' : 'Approve For Beta'}</button>
                {!(welcomeFor(welcomes, openUser.email) && welcomeFor(welcomes, openUser.email).times > 0) && <WelcomeToggle on={access.mail} setOn={(v) => setAccess((a) => ({ ...a, mail: v }))} disabled={Boolean(access.busy)} />}
                <p className="ad-muted ad-small">They made an account but aren't approved yet, so Crumb isn't syncing for them.</p>
              </>
            )}
            {!openUser.is_admin && <Nudge big key={`n-${openUser.email}`} email={openUser.email} last={nudged[String(openUser.email || '').toLowerCase()]} onDone={(m) => { setSheetNote(m); onChanged(); }} />}
            {!openUser.is_admin && invitesOk && !waiting(openUser) && (
              <div className="ad-rep-welcome">
                <ResendWelcome email={openUser.email} name={nameOf(openUser)} welcome={welcomeFor(welcomes, openUser.email)} onDone={(r) => { setSheetNote(r.err || r.note || ''); onChanged(); }} />
                <span className="ad-muted ad-small">{welcomeLine(welcomeFor(welcomes, openUser.email))}</span>
              </div>
            )}
            {!openUser.is_admin && invitesOk && !waiting(openUser) && (access.ask ? (
              <span className="ad-resend-ask ad-center">
                <span className="ad-small">Take beta access away? Their data stays.</span>
                <button type="button" className="ad-link-btn ad-invite-yes" onClick={() => removeAccess(openUser)} disabled={Boolean(access.busy)}>{access.busy === 'remove' ? 'Removing…' : 'Yes, Remove'}</button>
                <button type="button" className="ad-link-btn" onClick={() => setAccess((a) => ({ ...a, ask: false }))} disabled={Boolean(access.busy)}>Cancel</button>
              </span>
            ) : (
              <button type="button" className="ad-link-btn ad-rep-del" onClick={() => setAccess((a) => ({ ...a, ask: true, err: '' }))}>Remove Beta Access</button>
            ))}
            {!openUser.is_admin && <button type="button" className="ad-del-btn ad-rep-del" onClick={() => { const e = openUser.email; setOpenEmail(''); setDone(''); setDeleting(e); }}>Delete Account</button>}
            <button type="button" className="ad-link-btn ad-sheet-cancel" onClick={() => setOpenEmail('')}>Close</button>
          </div>
        </div>
      )}

      {openLead && (
        <LeadSheet key={openLead.email} lead={openLead} welcome={welcomeFor(welcomes, openLead.email)} answers={answersFor(answers, openLead.email)}
          onClose={() => setOpenEmail('')} onDone={(note) => { setOpenEmail(''); setDone(note || ''); onChanged(); }} />
      )}
      {inviting && <InviteSheet beta={beta} onClose={() => setInviting(false)} onDone={(note) => { setInviting(false); setDone(note || ''); onChanged(); }} />}

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
        <p className="ad-muted ad-small">{[areaLabel(item.area), item.email, item.device, item.app_version && `v ${item.app_version}`, shortDate(item.created_at)].filter(Boolean).join(' · ')}</p>
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

// Resend Welcome Email: always asks first, never changes approval.
function ResendWelcome({ email, name, welcome, onDone, disabled }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const sent = welcome && welcome.times > 0;
  const go = async () => {
    if (busy) return;
    setBusy(true);
    const res = await sendWelcome(email, name, true);
    setBusy(false); setAsking(false);
    onDone(res.err ? { err: `Welcome email to ${email} didn’t go out: ${res.err}` } : { note: res.skipped ? 'A welcome email is already on its way.' : `Welcome email sent to ${email}.` });
  };
  if (!asking) {
    return <button type="button" className="ad-link-btn ad-resend-btn" disabled={disabled} onClick={() => setAsking(true)}>{sent ? 'Resend Welcome Email' : 'Send Welcome Email'}</button>;
  }
  return (
    <span className="ad-resend-ask">
      <span className="ad-small">{sent ? 'Send it again?' : 'Send it now?'}</span>
      <button type="button" className="ad-link-btn" onClick={go} disabled={busy}>{busy ? 'Sending…' : sent ? 'Yes, Resend' : 'Yes, Send'}</button>
      <button type="button" className="ad-link-btn" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
    </span>
  );
}

// ---------- beta sign-ups (from crumbsales.com) ----------
const BETA_STATUSES = [['new', 'New'], ['invited', 'Invited'], ['declined', 'Declined']];
const betaWord = (st) => (BETA_STATUSES.find(([v]) => v === st) || [st, st])[1];

function BetaSheet({ item, welcome, answers, onClose, onSaved }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [mail, setMail] = useState(true);
  const pick = async (st) => {
    if (busy) return;
    setBusy(st); setMsg('');
    const { error } = await cloud().rpc('admin_beta_set_status', { p_id: item.id, p_status: st });
    if (error) { setBusy(''); setMsg(plainError(error)); return; }
    // Newly marked Invited: send the welcome email (if the switch is on). The server never sends a second one.
    const res = st === 'invited' && item.status !== 'invited' && mail ? await sendWelcome(item.email, item.name) : null;
    setBusy('');
    onSaved(res === null ? '' : `${item.email} is invited.${mailNote(item.email, res)}`);
  };
  return (
    <div className="ad-sheet-back" onClick={busy ? undefined : onClose}>
      <div className="ad-sheet" role="dialog" aria-modal="true" aria-labelledby="ad-beta-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ad-beta-title" className="ad-sheet-title">{item.name}</h2>
        <p className="ad-sheet-email">{item.email}</p>
        <p className="ad-muted ad-small">{[item.industry, item.state, item.company, item.heard && `Heard: ${item.heard}`, `Joined ${shortDate(item.created_at)}`].filter(Boolean).join(' · ')}</p>
        <Answers data={answers} />
        <div className="ad-status-list" role="group" aria-label="Status">
          {BETA_STATUSES.map(([v, label]) => (
            <button key={v} type="button" className={`ad-status-btn ${item.status === v ? 'is-on' : ''}`} disabled={Boolean(busy)} onClick={() => pick(v)}>
              {busy === v ? 'Saving…' : label}{item.status === v ? ' ✓' : ''}
            </button>
          ))}
        </div>
        {item.status !== 'invited' && !(welcome && welcome.times > 0) && <WelcomeToggle on={mail} setOn={setMail} disabled={Boolean(busy)} />}
        {(item.status === 'invited' || (welcome && welcome.times > 0)) && (
          <div className="ad-welcome-row">
            <span className="ad-muted ad-small">{welcomeLine(welcome)}</span>
            {item.status === 'invited' && (
              <ResendWelcome email={item.email} name={item.name} welcome={welcome} disabled={Boolean(busy)}
                onDone={(r) => (r.err ? setMsg(r.err) : onSaved(r.note))} />
            )}
          </div>
        )}
        <p className="ad-muted ad-small">Invited lets this email into Crumb{item.status !== 'invited' && mail && !(welcome && welcome.times > 0) ? ' and sends the welcome email' : ''}. New or Declined takes access away (never their data).</p>
        {msg && <p className="ad-error" role="alert">{msg}</p>}
        <button className="ad-link-btn ad-sheet-cancel" type="button" onClick={onClose} disabled={Boolean(busy)}>Close</button>
      </div>
    </div>
  );
}

// ---------- sync access (invite-only beta): who may sync with the cloud ----------
const SOURCE_WORD = { founder: 'Owner', beta: 'From Beta', admin: 'Added By Hand' };

function SyncAccess({ invites, err, beta = [], welcomes = [], onChanged }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState('');
  const [mail, setMail] = useState(true);
  const add = async (e) => {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy('add'); setMsg(''); setNote('');
    const { data, error } = await cloud().rpc('admin_sync_invite_add', { p_email: email });
    if (error) { setBusy(''); setMsg(plainError(error)); return; }
    const em = data || email.trim().toLowerCase();
    setNote(`Added ${em}.${mail ? mailNote(em, await sendWelcome(em, nameFor(beta, em))) : ''}`);
    setBusy('');
    setEmail('');
    onChanged();
  };
  const remove = async (em) => {
    if (busy) return;
    setBusy(em); setMsg('');
    const { error } = await cloud().rpc('admin_sync_invite_remove', { p_email: em });
    setBusy(''); setAsking('');
    if (error) { setMsg(plainError(error)); return; }
    onChanged();
  };
  return (
    <>
      <h2 className="ad-h2">Sync Access</h2>
      <p className="ad-muted ad-small">Only these emails can sync with the cloud. Everyone else uses Crumb on their own device.</p>
      {err ? (
        <p className="ad-error">{err}</p>
      ) : (
        <>
          <form className="ad-card ad-invite-add" onSubmit={add}>
            <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="Email Address" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(busy)} />
            <button type="submit" className="ad-btn ad-invite-btn" disabled={Boolean(busy) || !email.trim()}>{busy === 'add' ? 'Adding…' : 'Add Email'}</button>
          </form>
          <WelcomeToggle on={mail} setOn={setMail} disabled={Boolean(busy)} />
          {note && <p className="ad-done" role="status">{note}</p>}
          {msg && <p className="ad-error" role="alert">{msg}</p>}
          <div className="ad-card ad-rows">
            {invites.map((i) => (
              <div key={i.email} className="ad-row ad-invite-row">
                <span className="ad-invite-text">
                  <span className="ad-invite-email">{i.email}</span>
                  <span className="ad-muted ad-small">{SOURCE_WORD[i.source] || i.source} · {i.has_account ? 'Signed Up' : 'No Account Yet'}</span>
                  {i.source !== 'founder' && <span className="ad-muted ad-small">{welcomeLine(welcomeFor(welcomes, i.email))}</span>}
                  {i.source !== 'founder' && asking !== i.email && (
                    <ResendWelcome email={i.email} name={nameFor(beta, i.email)} welcome={welcomeFor(welcomes, i.email)} disabled={Boolean(busy)}
                      onDone={(r) => { setMsg(r.err || ''); setNote(r.note || ''); onChanged(); }} />
                  )}
                </span>
                {i.source !== 'founder' && (asking === i.email ? (
                  <span className="ad-invite-ask">
                    <button type="button" className="ad-link-btn ad-invite-yes" onClick={() => remove(i.email)} disabled={Boolean(busy)}>{busy === i.email ? 'Removing…' : 'Remove'}</button>
                    <button type="button" className="ad-link-btn" onClick={() => setAsking('')} disabled={Boolean(busy)}>Cancel</button>
                  </span>
                ) : (
                  <span className="ad-invite-ask">
                    <button type="button" className="ad-link-btn" onClick={() => setAsking(i.email)} disabled={Boolean(busy)}>Remove</button>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Inbox({ items, err, beta = [], betaErr = '', invites = [], invitesErr = '', welcomes = [], answers = [], onChanged }) {
  const [kind, setKind] = useState('problem');
  const [open, setOpen] = useState(null);
  const [openBeta, setOpenBeta] = useState(null);
  const [betaNote, setBetaNote] = useState('');
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
                  <span className="ad-beta-ind">{b.industry || 'No Industry Given'}</span>
                  <span className={`ad-pill ${b.status === 'new' ? 'ad-pill-new' : b.status === 'invited' ? 'ad-pill-ok' : 'ad-pill-quiet'}`}>{betaWord(b.status).toUpperCase()}</span>
                </span>
                <span className="ad-ticket-msg">{b.name}</span>
                <span className="ad-muted ad-small">{[b.email, b.state, b.company, b.heard && `Heard: ${b.heard}`, ago(b.created_at)].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            {!betaErr && beta.length === 0 && <div className="ad-card ad-coming"><p>No beta sign-ups yet. They come from the Join The Beta form on crumbsales.com.</p></div>}
          </div>
          {betaNote && <p className="ad-done" role="status">{betaNote}</p>}
          <SyncAccess invites={invites} err={invitesErr} beta={beta} welcomes={welcomes} onChanged={onChanged} />
          {openBeta && <BetaSheet item={openBeta} welcome={welcomeFor(welcomes, openBeta.email)} answers={answersFor(answers, openBeta.email)} onClose={() => setOpenBeta(null)} onSaved={(note) => { setOpenBeta(null); setBetaNote(note || ''); onChanged(); }} />}
        </>
      ) : (
      <>
      {err && <p className="ad-error">{err}</p>}
      <div className="ad-list">
        {sorted.map((i) => (
          <button key={i.id} type="button" className={`ad-ticket ${DONE.has(i.status) ? 'is-done' : ''} ${i.status === 'new' ? 'is-new' : ''}`} onClick={() => setOpen(i)}>
            <span className="ad-ticket-top">
              <span className="ad-muted ad-small">#{i.id}{i.area ? ` · ${areaLabel(i.area)}` : ''}</span>
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
  const [inbox, setInbox] = useState({ items: [], err: '', beta: [], betaErr: '', invites: [], invitesErr: '', welcomes: [], answers: [] });
  const [health, setHealth] = useState({ db: null, dbMs: null, dbErr: '', rem: null, remErr: '' });
  const [msg, setMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [nudged, setNudged] = useState({}); // { email: when last nudged }
  const [usersView, setUsersView] = useState({ filter: 'all', n: 0 }); // which group a tapped Overview tile opens

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
      try {
        const r = await fetch(`${CRM_URL}/api/admin-nudge`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
        const body = await r.json().catch(() => ({}));
        if (r.ok && body.nudged) setNudged(body.nudged);
      } catch {
        /* the dates are extra: Users still loads */
      }
      const fb = await sb.rpc('admin_feedback_list');
      const bt = await sb.rpc('admin_beta_list');
      const si = await sb.rpc('admin_sync_invites_list');
      const sa = await sb.rpc('admin_signup_answers'); // before 0014 is run: no answers shown
      const wl = await sb.rpc('admin_welcome_list'); // before 0012 is run there's no record yet (shows No Welcome Email Yet)
      const siMissing = si.error && (si.error.code === 'PGRST202' || /could not find the function/i.test(si.error.message || ''));
      setInbox({
        items: fb.error ? [] : (fb.data || []), err: fb.error ? plainError(fb.error) : '',
        beta: bt.error ? [] : (bt.data || []), betaErr: bt.error ? plainError(bt.error) : '',
        invites: si.error ? [] : (si.data || []),
        welcomes: wl.error ? [] : (wl.data || []),
        answers: sa.error ? [] : (sa.data || []),
        invitesErr: siMissing ? 'Not turned on yet: the invite list SQL (0010) hasn’t been run in Supabase.' : si.error ? plainError(si.error) : '',
      });
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
        {tab === 'overview' && overview && <Overview data={overview} users={users} email={email} onSignOut={signOut} newTickets={inbox.items.filter((i) => i.kind === 'problem' && i.status === 'new').length} newSuggestions={inbox.items.filter((i) => i.kind === 'suggestion' && i.status === 'new').length} newBeta={inbox.beta.filter((b) => b.status === 'new').length} onOpenInbox={() => pick('inbox')} onOpenUsers={(f) => { setUsersView({ filter: f, n: Date.now() }); pick('users'); }} />}
        {tab === 'users' && <Users key={usersView.n} initialFilter={usersView.filter} nudged={nudged} beta={inbox.beta} welcomes={inbox.welcomes} users={users} log={log} invites={inbox.invites} invitesOk={!inbox.invitesErr} answers={inbox.answers} onChanged={load} />}
        {tab === 'health' && <Health {...health} />}
        {tab === 'inbox' && <Inbox items={inbox.items} err={inbox.err} beta={inbox.beta} betaErr={inbox.betaErr} invites={inbox.invites} invitesErr={inbox.invitesErr} welcomes={inbox.welcomes} answers={inbox.answers} onChanged={load} />}
      </main>

      <nav className="ad-tabs" aria-label="Admin sections">
        {[['overview', 'Overview'], ['users', 'People'], ['health', 'Health'], ['inbox', 'Inbox']].map(([id, label]) => (
          <button key={id} type="button" className={`ad-tab ${tab === id ? 'is-on' : ''}`} onClick={() => pick(id)} aria-current={tab === id ? 'page' : undefined}>
            <span className="ad-tab-icon">{Icon[id]}{id === 'inbox' && (inbox.items.some((i) => i.status === 'new') || inbox.beta.some((b) => b.status === 'new')) && <span className="ad-badge" aria-label="New items" />}</span><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
