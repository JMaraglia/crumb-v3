// file: src/SetupPage.jsx
// Right after signing in (Nov 8 sign-in plan, step 1): "Getting your account ready…", then Home.
// An empty device downloads the account (or starts fresh) on its own. No buttons unless something goes wrong,
// and then nothing on the device has changed: Try Again, or Not Now (Crumb tries again next time it opens).
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUpAfterSignIn } from './syncMove';
import { plainError } from './cloudErrors';
import './SetupPage.css';

export const SETUP_SKIP_KEY = 'crumb_setup_not_now'; // this visit only (sessionStorage): don't reopen setup

// Setup runs on its own only once per app launch, even if this screen is redrawn. After a failure it waits
// for Try Again (no retry loops hammering the cloud).
let autoRan = false;
let lastErr = '';

export default function SetupPage() {
  const navigate = useNavigate();
  const [err, setErr] = useState(lastErr);
  const [tries, setTries] = useState(0);
  const step = useRef('starting');
  const running = useRef(false);

  useEffect(() => {
    if (running.current) return;
    if (tries === 0 && autoRan) return; // already tried this launch: wait for Try Again
    autoRan = true;
    running.current = true;
    lastErr = '';
    setErr('');
    step.current = 'starting';
    setUpAfterSignIn((label) => (step.current = label))
      .then((r) => {
        if (r.status === 'downloaded' || r.status === 'fresh') {
          window.location.replace('/'); // every screen starts over with the account's data
          return;
        }
        if (r.status === 'has-local') {
          navigate('/cloud-test', { replace: true }); // this device has its own data: asked about there (for now)
          return;
        }
        if (r.status === 'signed-out') {
          navigate('/sign-in', { replace: true });
          return;
        }
        navigate('/', { replace: true }); // ready / not-invited: nothing to set up
      })
      .catch((e) => {
        running.current = false;
        console.error('Crumb setup failed at', step.current, e);
        lastErr = `${plainError(e)} (Step: ${step.current})`;
        setErr(lastErr);
      });
  }, [tries, navigate]);

  const notNow = () => {
    try {
      sessionStorage.setItem(SETUP_SKIP_KEY, '1');
    } catch {
      // can't remember it: Home still opens
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="home-container su-page">
      <h1 className="crumb-logo su-logo">Crumb.</h1>
      {!err ? (
        <div className="su-card" role="status" aria-live="polite">
          <div className="su-spinner" aria-hidden="true" />
          <div className="su-title">Getting Your Account Ready…</div>
          <div className="su-sub">This only happens once on this device.</div>
        </div>
      ) : (
        <div className="su-card" role="alert">
          <div className="su-title">Couldn’t Finish Setting Up</div>
          <div className="su-sub">Nothing on this device changed. {err}</div>
          <button className="su-btn" onClick={() => setTries((n) => n + 1)}>Try Again</button>
          <button className="su-btn su-btn-plain" onClick={notNow}>Not Now</button>
        </div>
      )}
    </div>
  );
}
