// file: src/MfaPage.jsx
// "Today's Code": the daily authenticator code (MFA), Nov 2026.
// First time: set up an authenticator app (Google / Microsoft Authenticator). Every day after: one 6-digit code.
// No signal: waits for signal (founder's decision). Never touches data, sync or reminders.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOutThisDevice } from './cloud';
import { isRealSynced } from './syncMode';
import { verifiedAuthenticators, startSetup, verifyCode, mfaError, codeEnteredToday } from './mfa';
import './SignInPage.css';
import './MfaPage.css';

const OFFLINE_TEXT = 'No signal. Connect to Wi-Fi or cell signal to enter today’s code. Your work is saved on this phone.';

export default function MfaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state && location.state.from) || '/';

  const [stage, setStage] = useState('loading'); // loading | offline | setup | daily | error
  const [factors, setFactors] = useState([]);
  const [setup, setSetup] = useState(null); // { factorId, qr, secret, uri }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // Kept in a ref so the setup below runs once (a new navigate function must never start a second setup).
  const doneRef = useRef(() => {});
  doneRef.current = () => navigate(backTo, { replace: true });
  const done = () => doneRef.current();

  const begin = useCallback(async () => {
    setErr('');
    if (codeEnteredToday()) { doneRef.current(); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStage('offline'); return; }
    setStage('loading');
    try {
      const list = await verifiedAuthenticators();
      if (list.length) {
        setFactors(list);
        setStage('daily');
      } else {
        setSetup(await startSetup());
        setStage('setup');
      }
    } catch (e) {
      const msg = mfaError(e);
      if (/No signal/.test(msg)) setStage('offline');
      else { setErr(msg); setStage('error'); }
    }
  }, []);

  useEffect(() => {
    begin();
    const onOnline = () => begin();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [begin]);

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await verifyCode(code, stage === 'setup' ? [setup.factorId] : factors.map((f) => f.id));
      done();
    } catch (e2) {
      setErr(mfaError(e2));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await signOutThisDevice();
    window.location.replace(isRealSynced() ? '/sign-in' : '/');
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* the key is shown on screen to type instead */
    }
  };

  const codeBox = (
    <form className="si-form" onSubmit={submit} noValidate>
      <input
        className="si-input mf-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={7}
        placeholder="6-digit code"
        aria-label="6-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
      />
      <button type="submit" className="si-btn" disabled={busy || code.replace(/\D/g, '').length !== 6}>
        {busy ? 'Checking…' : stage === 'setup' ? 'Finish Setup' : 'Unlock Crumb'}
      </button>
      {err && <div className="si-msg si-err" role="alert">{err}</div>}
    </form>
  );

  return (
    <div className="home-container si-page mf-page">
      <h1 className="crumb-logo" style={{ textAlign: 'center', fontSize: '4rem', marginBottom: '10px' }}>Crumb.</h1>

      <div className="si-card">
        {stage === 'loading' && <p className="mf-text">Checking…</p>}

        {stage === 'offline' && (
          <>
            <h2 className="mf-title">Today’s Code</h2>
            <div className="si-msg si-err" role="status">{OFFLINE_TEXT}</div>
            <button type="button" className="si-btn" onClick={begin}>Try Again</button>
          </>
        )}

        {stage === 'error' && (
          <>
            <h2 className="mf-title">Today’s Code</h2>
            <div className="si-msg si-err" role="alert">{err}</div>
            <button type="button" className="si-btn" onClick={begin}>Try Again</button>
          </>
        )}

        {stage === 'daily' && (
          <>
            <h2 className="mf-title">Today’s Code</h2>
            <p className="mf-text">Open your authenticator app and enter the 6-digit code for Crumb. Once a day on this device.</p>
            {codeBox}
          </>
        )}

        {stage === 'setup' && setup && (
          <>
            <h2 className="mf-title">Protect Your Account</h2>
            <p className="mf-text">
              Crumb asks for a 6-digit code from an authenticator app once a day. Use <b>Google Authenticator</b> or{' '}
              <b>Microsoft Authenticator</b> (free in the App Store).
            </p>

            <div className="mf-step"><span className="mf-num">1</span><span>Add Crumb to your authenticator app:</span></div>
            <a className="si-btn mf-linkbtn" href={setup.uri}>Add To Authenticator App</a>
            <p className="mf-small">Or type this key into the app:</p>
            <div className="mf-key">
              <code>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              <button type="button" className="mf-copy" onClick={copyKey}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
            <button type="button" className="si-link" onClick={() => setShowQr((v) => !v)}>
              {showQr ? 'Hide QR Code' : 'Setting up on another device? Show QR Code'}
            </button>
            {showQr && <img className="mf-qr" src={setup.qr} alt="QR code for your authenticator app" />}
            <p className="mf-small mf-tip">Tip: also save this key in your password manager. It’s your backup if you lose this phone.</p>

            <div className="mf-step"><span className="mf-num">2</span><span>Enter the 6-digit code it shows:</span></div>
            {codeBox}
          </>
        )}
      </div>

      <div className="si-switch">
        <button type="button" className="si-link si-link-inline" onClick={signOut}>Sign Out</button>
      </div>
      <p className="mf-help">Lost your phone or authenticator app? Contact the Crumb team to reset it.</p>
    </div>
  );
}
