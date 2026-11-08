// file: src/SetupPage.jsx
// Right after signing in (Nov 8 sign-in plan). An empty device sets itself up with no buttons (step 1).
// A device that already has its own data is asked ONCE (step 2), never replaced or merged on its own:
//   account has data -> Use My Account (this device's copy is kept as a safety copy first) / Keep Separate
//   account is empty -> Add It (this device's data goes up) / Not Now
// If anything can't finish, nothing on the device has changed: Try Again, or Not Now.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUpAfterSignIn, useMyAccount, addThisDevice, keepSeparate } from './syncMove';
import { plainError } from './cloudErrors';
import './SetupPage.css';

export const SETUP_SKIP_KEY = 'crumb_setup_not_now'; // this visit only (sessionStorage): don't reopen setup

// Setup runs on its own only once per app launch, even if this screen is redrawn. After a failure it waits
// for Try Again (no retry loops hammering the cloud).
let autoRan = false;
let lastErr = '';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sideText = (c) => [plural(c.customers, 'customer'), `${c.prospects} in Pipeline`].join(' · ');

export default function SetupPage() {
  const navigate = useNavigate();
  const [err, setErr] = useState(lastErr);
  const [ask, setAsk] = useState(null); // { testCopy, cloudHasData, device, cloud }
  const [busy, setBusy] = useState('');
  const [separated, setSeparated] = useState(false);
  const [tries, setTries] = useState(0);
  const running = useRef(false);
  const step = useRef('starting');

  const fail = (e) => {
    running.current = false;
    console.error('Crumb setup failed at', step.current, e);
    const first = e && e.detail && e.detail.problems && e.detail.problems[0];
    lastErr = `${plainError(e)} (Step: ${step.current}${first ? `. ${first}` : ''})`;
    setBusy('');
    setErr(lastErr);
  };

  useEffect(() => {
    if (running.current) return;
    if (tries === 0 && autoRan) return; // already tried this launch: wait for Try Again
    autoRan = true;
    running.current = true;
    lastErr = '';
    setErr('');
    setAsk(null);
    step.current = 'starting';
    setUpAfterSignIn((label) => (step.current = label))
      .then((r) => {
        running.current = false;
        if (r.status === 'downloaded' || r.status === 'fresh') {
          window.location.replace('/'); // every screen starts over with the account's data
          return;
        }
        if (r.status === 'ask') {
          setAsk(r);
          return;
        }
        if (r.status === 'signed-out') {
          navigate('/sign-in', { replace: true });
          return;
        }
        navigate('/', { replace: true }); // ready / not-invited: nothing to set up
      })
      .catch(fail);
  }, [tries, navigate]);

  const run = (fn) => {
    setErr('');
    setBusy('Working…');
    step.current = 'starting';
    fn((label) => {
      step.current = label;
      setBusy(label);
    })
      .then(() => window.location.replace('/'))
      .catch(fail);
  };

  const separate = () => {
    keepSeparate();
    try {
      sessionStorage.setItem(SETUP_SKIP_KEY, '1');
    } catch {
      // can't remember it for this visit: Home still opens
    }
    setSeparated(true);
  };

  const notNow = () => {
    try {
      sessionStorage.setItem(SETUP_SKIP_KEY, '1');
    } catch {
      // can't remember it: Home still opens
    }
    navigate('/', { replace: true });
  };

  let card;
  if (separated) {
    card = (
      <div className="su-card">
        <div className="su-title">Kept Separate</div>
        <div className="su-sub">
          This device keeps its own information. It won’t sync with your account, and changes made here won’t show up on your
          other devices, until you set it up. You can do that anytime from the note on the Home screen.
        </div>
        <button className="su-btn" onClick={() => navigate('/', { replace: true })}>OK</button>
      </div>
    );
  } else if (busy) {
    card = (
      <div className="su-card" role="status" aria-live="polite">
        <div className="su-spinner" aria-hidden="true" />
        <div className="su-title">{busy}</div>
        <div className="su-sub">Keep Crumb open until this finishes.</div>
      </div>
    );
  } else if (err) {
    card = (
      <div className="su-card" role="alert">
        <div className="su-title">Couldn’t Finish Setting Up</div>
        <div className="su-sub">Nothing on this device changed. {err}</div>
        <button className="su-btn" onClick={() => setTries((n) => n + 1)}>Try Again</button>
        <button className="su-btn su-btn-plain" onClick={notNow}>Not Now</button>
      </div>
    );
  } else if (ask && ask.cloudHasData) {
    card = (
      <div className="su-card">
        <div className="su-title">{ask.testCopy ? 'This Device Has Test Data' : 'This Device Has Its Own Copy'}</div>
        <div className="su-sub">
          {ask.testCopy
            ? 'This device has made-up test data on it. Use your account here instead?'
            : 'Crumb found information saved on this device that isn’t part of your account. Use your account here instead?'}
        </div>
        <div className="su-compare">
          <div><span>This device</span>{sideText(ask.device)}</div>
          <div><span>Your account</span>{sideText(ask.cloud)}</div>
        </div>
        <div className="su-sub su-small">This device’s copy is saved first (Settings → Backup & Restore), so nothing is lost.</div>
        <button className="su-btn" onClick={() => run(useMyAccount)}>Use My Account</button>
        <button className="su-btn su-btn-plain" onClick={separate}>Keep Separate</button>
      </div>
    );
  } else if (ask) {
    card = ask.testCopy ? (
      <div className="su-card">
        <div className="su-title">This Device Has Test Data</div>
        <div className="su-sub">This device has made-up test data on it, and your account is empty. Start your account fresh here?</div>
        <div className="su-sub su-small">The test data is saved first (Settings → Backup & Restore).</div>
        <button className="su-btn" onClick={() => run(useMyAccount)}>Start Fresh</button>
        <button className="su-btn su-btn-plain" onClick={separate}>Keep Test Data</button>
      </div>
    ) : (
      <div className="su-card">
        <div className="su-title">Add This Device’s Information To Your Account?</div>
        <div className="su-sub">
          Your account is empty. Crumb can put what’s on this device into your account, so your other devices get it too.
        </div>
        <div className="su-compare">
          <div><span>This device</span>{sideText(ask.device)}</div>
        </div>
        <div className="su-sub su-small">Nothing on this device changes, and a safety copy is saved first.</div>
        <button className="su-btn" onClick={() => run(addThisDevice)}>Add It</button>
        <button className="su-btn su-btn-plain" onClick={separate}>Not Now</button>
      </div>
    );
  } else {
    card = (
      <div className="su-card" role="status" aria-live="polite">
        <div className="su-spinner" aria-hidden="true" />
        <div className="su-title">Getting Your Account Ready…</div>
        <div className="su-sub">This only happens once on this device.</div>
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
