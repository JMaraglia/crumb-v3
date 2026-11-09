// file: src/AccessPage.jsx
// The beta lock (Nov 8 access plan): signed in, but is this account approved? Asks the cloud, then either
// opens Crumb or shows "You're On The List". Nothing on this device is changed or removed here: data on a
// device that isn't approved just stays out of reach until an approved account signs in.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkInvited, hasSignIn, signedInEmail, accessState } from './syncMode';
import './AccessPage.css';

export default function AccessPage() {
  const navigate = useNavigate();
  const [state, setState] = useState(() => (accessState() === 'denied' ? 'denied' : 'checking')); // checking | denied | error
  const [tries, setTries] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const email = signedInEmail();

  useEffect(() => {
    if (!hasSignIn()) {
      navigate('/sign-in', { replace: true, state: { from: '/setup', gate: true } });
      return;
    }
    let gone = false;
    (async () => {
      try {
        const { cloud } = await import('./cloud');
        const sb = cloud();
        if (!sb) throw new Error('no cloud');
        const yes = await checkInvited(sb, email);
        if (gone) return;
        if (yes) navigate('/', { replace: true });
        else setState('denied');
      } catch {
        if (gone) return;
        // Couldn't ask (no signal). An account approved before keeps working; otherwise wait and try again.
        if (accessState() === 'ok') navigate('/', { replace: true });
        else setState((s) => (s === 'denied' ? 'denied' : 'error'));
      }
    })();
    return () => {
      gone = true;
    };
  }, [tries, email, navigate]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      const { signOutThisDevice } = await import('./cloud');
      await signOutThisDevice();
    } catch {
      /* the app restarts below either way */
    }
    window.location.replace('/sign-in');
  };

  let card;
  if (state === 'checking') {
    card = (
      <div className="wl-card" role="status" aria-live="polite">
        <div className="wl-spinner" aria-hidden="true" />
        <div className="wl-title">Checking Your Account…</div>
      </div>
    );
  } else if (state === 'denied') {
    card = (
      <div className="wl-card">
        <div className="wl-title">You’re On The List</div>
        <div className="wl-sub">
          Thanks for your interest in Crumb. It’s invite-only during the beta, and this account hasn’t been approved yet.
          We’ll email you when your spot opens.
        </div>
        {email && <div className="wl-email">{email}</div>}
        <button className="wl-btn wl-btn-plain" onClick={() => setTries((n) => n + 1)} disabled={signingOut}>Check Again</button>
        <button className="wl-btn wl-btn-plain" onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing Out…' : 'Sign Out'}</button>
      </div>
    );
  } else {
    card = (
      <div className="wl-card" role="alert">
        <div className="wl-title">Couldn’t Check Your Account</div>
        <div className="wl-sub">Crumb needs a connection to check your account the first time. Check your signal and try again.</div>
        <button className="wl-btn" onClick={() => { setState('checking'); setTries((n) => n + 1); }}>Try Again</button>
        <button className="wl-btn wl-btn-plain" onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing Out…' : 'Sign Out'}</button>
      </div>
    );
  }

  return (
    <div className="home-container wl-page">
      <h1 className="crumb-logo wl-logo">Crumb.</h1>
      {card}
    </div>
  );
}
