// file: src/SignInPage.jsx
// Sign In (and Create Account) for Crumb's cloud. Its own clean screen: messages appear right under the
// button (never below the fold), and Forgot Password opens its own panel.
// Signing in is only needed to sync between devices: Crumb works fully without it.
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { cloud, cloudProblem } from './cloud';
import { plainError } from './cloudErrors';
import { needsSignIn } from './syncMode';
import './SignInPage.css';

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened as the front door (a syncing device with nobody signed in): no back arrow, Home after signing in.
  const [gate] = useState(() => Boolean(location.state && location.state.gate) || needsSignIn());
  const backTo = (location.state && location.state.from) || (gate ? '/' : '/cloud-test');
  const sb = cloud();
  const [mode, setMode] = useState('signin'); // 'signin' | 'create'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotErr, setForgotErr] = useState('');
  const [forgotOk, setForgotOk] = useState('');

  // Already signed in? Nothing to do here.
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      if (data && data.session) navigate(backTo, { replace: true });
    });
  }, [sb, navigate, backTo]);

  const creating = mode === 'create';
  const canSubmit = email.trim() && password.length >= (creating ? 6 : 1) && !busy;

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!canSubmit || !sb) return;
    setErr('');
    setOk('');
    setBusy(true);
    try {
      if (creating) {
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/cloud-test` },
        });
        if (error) throw error;
        if (data && data.session) {
          navigate(backTo, { replace: true });
          return;
        }
        setOk(`Account created. Check your email (${email.trim()}) and tap the confirmation link, then sign in here.`);
        setMode('signin');
        setPassword('');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        navigate(backTo, { replace: true });
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
      {!gate && (
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

      <div className="si-card">
        {!sb ? (
          <div className="si-msg si-err">{cloudProblem ? `The cloud settings in this version look wrong: ${cloudProblem}` : 'The cloud isn’t set up in this version.'}</div>
        ) : (
          <form className="si-form" onSubmit={submit} noValidate>
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
              placeholder={creating ? 'Password (6+ characters)' : 'Password'}
              aria-label="Password"
              autoComplete={creating ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

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

      {sb && (
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
