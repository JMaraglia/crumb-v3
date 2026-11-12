// file: src/ResetPasswordOnly.jsx
// Security audit, Nov 12 2026: what a "reset your password" email link opens when the full Cloud screen may
// not be shown (nobody signed in yet, or the device isn't confirmed as this account's). It only sets a new
// password. Nothing saved on this device is read or shown here. Afterwards Setup runs its usual checks.
import React, { useEffect, useState } from 'react';
import { cloud } from './cloud';
import { plainError } from './cloudErrors';
import { passwordProblem } from './signupQuestions';
import './SetupPage.css';

export default function ResetPasswordOnly() {
  const sb = cloud();
  const [linkProblem] = useState(() => {
    const m = /error_description=([^&]+)/.exec(window.location.hash || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  });
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(sb));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!sb) return undefined;
    sb.auth.getSession().then(({ data }) => {
      setSession((data && data.session) || null);
      setLoading(false);
    }).catch(() => setLoading(false));
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s || null));
    return () => data && data.subscription && data.subscription.unsubscribe();
  }, [sb]);

  const save = async () => {
    const problem = passwordProblem(password);
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setDone(true);
    } catch (e) {
      setErr(plainError(e));
    }
    setBusy(false);
  };

  let card;
  if (done) {
    card = (
      <div className="su-card">
        <div className="su-title">Password Changed</div>
        <div className="su-sub">Use the new one from now on, on every device.</div>
        <button className="su-btn" onClick={() => window.location.replace('/setup')}>Continue</button>
      </div>
    );
  } else if (loading) {
    card = (
      <div className="su-card" role="status">
        <div className="su-title">Checking Your Link…</div>
      </div>
    );
  } else if (!session) {
    card = (
      <div className="su-card" role="alert">
        <div className="su-title">That Link Didn’t Work</div>
        <div className="su-sub">
          {linkProblem ? `${linkProblem}. ` : ''}Reset links expire after a while and work once. Ask for a new one from Sign In.
        </div>
        <button className="su-btn" onClick={() => window.location.replace('/sign-in')}>Go To Sign In</button>
      </div>
    );
  } else {
    card = (
      <div className="su-card">
        <div className="su-title">Set A New Password</div>
        <div className="su-sub">8+ characters, with a capital letter, a lowercase letter, a number and a special character.</div>
        <input
          className="su-input"
          type="password"
          autoComplete="new-password"
          aria-label="New password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line-d1d1d6, #d1d1d6)', fontSize: 16, margin: '4px 0 10px', background: 'var(--bg-ffffff, #fff)', color: 'inherit' }}
        />
        {err && <div className="su-sub" role="alert" style={{ color: '#ff3b30' }}>{err}</div>}
        <button className="su-btn" disabled={busy || !password} onClick={save}>{busy ? 'Saving…' : 'Save New Password'}</button>
      </div>
    );
  }
  return (
    <div className="home-container su-page">
      <h1 className="crumb-logo su-logo">Crumb.</h1>
      {card}
    </div>
  );
}
