// file: src/SignInPage.jsx
// Sign In (and Create Account) for Crumb's cloud. Its own clean screen: messages appear right under the
// button (never below the fold), and Forgot Password opens its own panel.
// Signing in is only needed to sync between devices: Crumb works fully without it.
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoShareOutline, IoAddCircleOutline, IoPhonePortraitOutline } from 'react-icons/io5';
import { cloud, cloudProblem } from './cloud';
import { plainError } from './cloudErrors';
import { needsSignIn, isRealSynced } from './syncMode';
import { SALES_RANGES, COLD_CALL_HOW, EMPTY_ANSWERS, missingAnswer, answersToSave, passwordProblem } from './signupQuestions';
import './SignInPage.css';

// iPhone or iPad, in a browser tab (not the Home Screen app). iPads report themselves as a Mac, so they're
// told apart by touch. The Home Screen app keeps its own copy of Crumb, separate from Safari's.
const isIpad = () => /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const onAppleTablet = () => /iPhone|iPod/.test(navigator.userAgent) || isIpad();
const inHomeScreenApp = () =>
  window.navigator.standalone === true || Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
const BROWSER_OK_KEY = 'crumb_signin_in_browser'; // this visit only (sessionStorage): "Continue In Browser" was tapped

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened as the front door (a syncing device with nobody signed in): no back arrow, Home after signing in.
  const [gate] = useState(() => Boolean(location.state && location.state.gate) || needsSignIn());
  // After signing in: the device sets itself up (download your account, or start fresh), then Home.
  const backTo = (location.state && location.state.from) || '/setup';
  // Opened because this is a brand-new device: no back arrow (Crumb needs an account).
  const [fresh] = useState(() => Boolean(location.state && location.state.fresh));
  const sb = cloud();
  const [mode, setMode] = useState('signin'); // 'signin' | 'create'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Create Account questions (Nov 10): all required, saved with the new account.
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const setAnswer = (patch) => setAnswers((a) => ({ ...a, ...patch }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotErr, setForgotErr] = useState('');
  const [forgotOk, setForgotOk] = useState('');
  // Website Sign In on iPhone/iPad (Nov 8 plan, step 4): first show how to add Crumb to the Home Screen,
  // with a way to keep going in the browser anyway. Computers, the Home Screen app and a device that's
  // already syncing go straight to the form.
  const [homeSteps, setHomeSteps] = useState(() => {
    if (isRealSynced()) return false; // this device was already set up: just sign back in
    try {
      if (sessionStorage.getItem(BROWSER_OK_KEY) === '1') return false;
    } catch {
      /* can't remember: still fine */
    }
    return onAppleTablet() && !inHomeScreenApp();
  });
  const continueInBrowser = () => {
    try {
      sessionStorage.setItem(BROWSER_OK_KEY, '1');
    } catch {
      /* ignore */
    }
    setHomeSteps(false);
  };

  // Already signed in? Nothing to do here.
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      if (data && data.session) navigate(backTo, { replace: true });
    });
  }, [sb, navigate, backTo]);

  const creating = mode === 'create';
  const canSubmit = email.trim() && password.length >= 1 && !busy;

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!canSubmit || !sb) return;
    setErr('');
    setOk('');
    setBusy(true);
    try {
      if (creating) {
        const missing = missingAnswer(answers) || passwordProblem(password);
        if (missing) {
          setErr(missing);
          setBusy(false);
          return;
        }
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/setup`, data: { crumb_signup: answersToSave(answers) } },
        });
        if (error) throw error;
        // Nov 11: when the email already has an account, Supabase doesn't say so (it answers as if it worked,
        // with a user that has no sign-in methods, and sends no email). Say it plainly instead.
        if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setErr('That email already has an account. Sign in instead.');
          setMode('signin');
          setPassword('');
          setBusy(false);
          return;
        }
        if (data && data.session) {
          navigate('/setup', { replace: true });
          return;
        }
        setOk(`Account created. Check your email (${email.trim()}) and tap the confirmation link, then sign in here.`);
        setMode('signin');
        setPassword('');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // Every fresh sign-in goes through setup (it checks the invite list with the cloud, then sets this
        // device up or simply goes Home), even when Sign In was opened from Settings or the Cloud screen.
        navigate('/setup', { replace: true });
        return;
      }
    } catch (e2) {
      setErr(plainError(e2));
    }
    setBusy(false);
  };

  const openForgot = () => {
    setForgotEmail(email.trim());
    setForgotErr('');
    setForgotOk('');
    setForgotOpen(true);
  };
  const sendReset = async (e) => {
    if (e) e.preventDefault();
    if (!forgotEmail.trim() || forgotBusy || !sb) return;
    setForgotErr('');
    setForgotOk('');
    setForgotBusy(true);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo: `${window.location.origin}/cloud-test` });
      if (error) throw error;
      setForgotOk(`Sent. Check your email (${forgotEmail.trim()}), including Spam, and tap the link to set a new password. It can take a few minutes.`);
    } catch (e2) {
      setForgotErr(plainError(e2));
    }
    setForgotBusy(false);
  };

  return (
    <div className="home-container si-page">
      {!gate && !fresh && (
        <button className="si-back" onClick={() => navigate(backTo)} aria-label="Back">
          <FaArrowLeft />
        </button>
      )}
      {/* Same top as Home */}
      <h1 className="crumb-logo" style={{ textAlign: 'center', fontSize: '4rem', marginBottom: '10px' }}>
        Crumb.
      </h1>
      <h2 style={{ textAlign: 'center', marginTop: 0, marginBottom: '30px' }}>
        Taking every last Crumb.
      </h2>

      {homeSteps ? (
        <div className="si-card si-home">
          <div className="si-home-title">Add Crumb To Your Home Screen</div>
          <p className="si-home-text">Crumb works best as an app on your {isIpad() ? 'iPad' : 'iPhone'}. It only takes a few seconds:</p>
          <ol className="si-home-steps">
            <li>
              <span className="si-home-icon" aria-hidden="true"><IoShareOutline /></span>
              <span>Tap the <b>Share</b> button {isIpad() ? 'at the top of the screen' : 'at the bottom of the screen'} (the square with an arrow).</span>
            </li>
            <li>
              <span className="si-home-icon" aria-hidden="true"><IoAddCircleOutline /></span>
              <span>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</span>
            </li>
            <li>
              <span className="si-home-icon" aria-hidden="true"><IoPhonePortraitOutline /></span>
              <span>Open <b>Crumb</b> from your Home Screen and sign in there.</span>
            </li>
          </ol>
          <button type="button" className="si-btn si-btn-plain si-home-continue" onClick={continueInBrowser}>
            Continue In Browser
          </button>
          <p className="si-home-note">Already added it? Open Crumb from your Home Screen.</p>
        </div>
      ) : (
      <div className="si-card">
        {!sb ? (
          <div className="si-msg si-err">{cloudProblem ? `The cloud settings in this version look wrong: ${cloudProblem}` : 'The cloud isn’t set up in this version.'}</div>
        ) : (
          <form className="si-form" onSubmit={submit} noValidate>
            {creating && <div className="si-section">Your Sign-In</div>}
            <input
              id="si-email"
              className="si-input"
              type="email"
              inputMode="email"
              placeholder="Email"
              aria-label="Email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              id="si-pass"
              className="si-input"
              type="password"
              placeholder="Password"
              aria-label="Password"
              autoComplete={creating ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {creating && <p className="si-q-note si-pass-note">At least 8 characters, with a capital letter, a lowercase letter, a number and a symbol (like ! or #).</p>}

            {creating && (
              <>
                <div className="si-section">Tell Us How You Sell</div>
                <label className="si-q">
                  <span className="si-q-label">How Many Active Customers Do You Currently Have?</span>
                  <input className="si-input" type="text" inputMode="numeric" pattern="[0-9]*" value={answers.customers}
                    onChange={(e) => setAnswer({ customers: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
                </label>
                <label className="si-q">
                  <span className="si-q-label">Annual Sales Per Year</span>
                  <select className="si-input si-select" value={answers.sales} onChange={(e) => setAnswer({ sales: e.target.value })}>
                    <option value="" disabled>Choose One</option>
                    {SALES_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <div className="si-q">
                  <span className="si-q-label">Do You Cold Call?</span>
                  <div className="si-choices" role="radiogroup" aria-label="Do You Cold Call?">
                    {[['yes', 'Yes'], ['no', 'No']].map(([v, label]) => (
                      <button key={v} type="button" role="radio" aria-checked={answers.coldCall === v}
                        className={`si-choice ${answers.coldCall === v ? 'is-on' : ''}`} onClick={() => setAnswer({ coldCall: v })}>{label}</button>
                    ))}
                  </div>
                </div>
                {answers.coldCall === 'yes' && (
                  <div className="si-q">
                    <span className="si-q-label">How Do You Cold Call?</span>
                    <div className="si-choices" role="radiogroup" aria-label="How Do You Cold Call?">
                      {COLD_CALL_HOW.map(([v, label]) => (
                        <button key={v} type="button" role="radio" aria-checked={answers.coldHow === v}
                          className={`si-choice ${answers.coldHow === v ? 'is-on' : ''}`} onClick={() => setAnswer({ coldHow: v })}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="si-q">
                  <span className="si-q-label">Are You Required To Make Daily Customer Or Prospect Stops?</span>
                  <div className="si-choices" role="radiogroup" aria-label="Are You Required To Make Daily Customer Or Prospect Stops?">
                    {[['yes', 'Yes'], ['no', 'No']].map(([v, label]) => (
                      <button key={v} type="button" role="radio" aria-checked={answers.stops === v}
                        className={`si-choice ${answers.stops === v ? 'is-on' : ''}`} onClick={() => setAnswer({ stops: v })}>{label}</button>
                    ))}
                  </div>
                </div>
                {answers.stops === 'yes' && (
                  <label className="si-q">
                    <span className="si-q-label">Average Stops Per Day</span>
                    <input className="si-input" type="text" inputMode="numeric" pattern="[0-9]*" value={answers.stopsPerDay}
                      onChange={(e) => setAnswer({ stopsPerDay: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                  </label>
                )}
                <label className="si-q">
                  <span className="si-q-label">What CRM Do You Currently Use?</span>
                  <input className="si-input" type="text" autoCapitalize="words" maxLength={80} value={answers.crm}
                    onChange={(e) => setAnswer({ crm: e.target.value })} />
                </label>
                <p className="si-q-note">Your name, industry and state come from your beta application.</p>
              </>
            )}

            <button type="submit" className="si-btn" disabled={!canSubmit}>
              {busy ? (creating ? 'Creating…' : 'Signing In…') : creating ? 'Create Account' : 'Sign In'}
            </button>

            {/* Right under the button, so you never have to scroll to see what happened */}
            {err && <div className="si-msg si-err" role="alert">{err}</div>}
            {ok && <div className="si-msg si-ok">{ok}</div>}

            {!creating && (
              <button type="button" className="si-link" onClick={openForgot}>
                Forgot Password?
              </button>
            )}
          </form>
        )}
      </div>
      )}

      {sb && !homeSteps && (
        <div className="si-switch">
          {creating ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="si-link si-link-inline"
            onClick={() => {
              setMode(creating ? 'signin' : 'create');
              setErr('');
              setOk('');
            }}
          >
            {creating ? 'Sign In' : 'Create An Account'}
          </button>
        </div>
      )}

      {forgotOpen && (
        <div className="si-overlay" onClick={() => setForgotOpen(false)}>
          <form className="si-sheet" onClick={(e) => e.stopPropagation()} onSubmit={sendReset} noValidate>
            <div className="si-sheet-grab" />
            <div className="si-sheet-title">Reset Your Password</div>
            <p className="si-sheet-text">We’ll email you a link to set a new password.</p>
            <input
              id="si-forgot-email"
              className="si-input"
              type="email"
              placeholder="Email"
              aria-label="Email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
            {!forgotOk && (
              <button type="submit" className="si-btn" disabled={!forgotEmail.trim() || forgotBusy}>
                {forgotBusy ? 'Sending…' : 'Send Reset Link'}
              </button>
            )}
            {forgotErr && <div className="si-msg si-err" role="alert">{forgotErr}</div>}
            {forgotOk && <div className="si-msg si-ok">{forgotOk}</div>}
            <button type="button" className="si-btn si-btn-plain" onClick={() => setForgotOpen(false)}>
              {forgotOk ? 'Done' : 'Cancel'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
