// file: src/FeedbackPage.jsx
// Report A Problem / Make A Suggestion (from Settings → Help). Goes to the Inbox in Crumb Admin.
// Sends only: what it's about, what the rep typed, device and app version. Nothing from their customers.
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { cloud, cloudReady } from './cloud';
import { plainError } from './cloudErrors';
import './FeedbackPage.css';

const AREAS = ['Calendar', 'Itinerary', 'Customers', 'Prospects', 'Notes', 'To-Do', 'Reminders', 'Sync', 'Other'];

const TEXT = {
  problem: {
    title: 'Report A Problem',
    ask: 'What went wrong?',
    hint: 'What you tapped and what happened. One line is fine.',
    done: (n) => `Sent. Your ticket number is #${n}.`,
  },
  suggestion: {
    title: 'Make A Suggestion',
    ask: 'What would make Crumb better?',
    hint: 'One line is fine.',
    done: () => 'Sent. Thanks, every suggestion gets read.',
  },
};

// Which device and which copy of Crumb (attached so a problem can be reproduced).
function deviceName() {
  const ua = navigator.userAgent || '';
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const kind = iPad ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'Computer';
  const ios = (ua.match(/OS (\d+)[._](\d+)/) || []).slice(1, 3).join('.');
  const home = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  return [kind, ios && `iOS ${ios}`, home ? 'Home Screen app' : 'browser'].filter(Boolean).join(' · ');
}
function appVersion() {
  const el = [...document.querySelectorAll('script[src]')].find((s) => /\/assets\/index-/.test(s.getAttribute('src') || ''));
  const m = el ? (el.getAttribute('src') || '').match(/index-([^."']+)/) : null;
  return m ? m[1] : 'dev';
}

export default function FeedbackPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const kind = new URLSearchParams(search).get('kind') === 'suggestion' ? 'suggestion' : 'problem';
  const t = TEXT[kind];

  const [signedIn, setSignedIn] = useState(null); // null = checking
  const [area, setArea] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentId, setSentId] = useState(null);

  useEffect(() => {
    const sb = cloudReady ? cloud() : null;
    if (!sb) { setSignedIn(false); return; }
    sb.auth.getSession().then(({ data }) => setSignedIn(Boolean(data && data.session))).catch(() => setSignedIn(false));
  }, []);

  const canSend = message.trim().length > 0 && !busy;
  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: err } = await cloud().rpc('submit_feedback', {
        p_kind: kind,
        p_area: area || 'Other',
        p_message: message.trim(),
        p_device: deviceName(),
        p_version: appVersion(),
      });
      if (err) throw err;
      setSentId(data);
    } catch (err) {
      setError(plainError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fb-page">
      <header className="fb-header">
        <button className="fb-icon-btn" onClick={() => navigate('/settings')} aria-label="Back">
          <FaArrowLeft />
        </button>
      </header>
      <div className="fb-content">
        <h1 className="fb-title">{t.title}</h1>

        {signedIn === false && (
          <div className="fb-card">
            <p className="fb-text">Sign in to Crumb to send this. It goes straight to the Crumb team.</p>
            <button className="fb-btn" onClick={() => navigate('/sign-in', { state: { from: `/feedback?kind=${kind}` } })}>Sign In</button>
          </div>
        )}

        {signedIn && sentId != null && (
          <div className="fb-card">
            <p className="fb-done">{t.done(sentId)}</p>
            <button className="fb-btn" onClick={() => navigate('/settings')}>Done</button>
          </div>
        )}

        {signedIn && sentId == null && (
          <>
            <div className="fb-label">What's it about?</div>
            <div className="fb-chips">
              {AREAS.map((a) => (
                <button key={a} className={`fb-chip ${area === a ? 'is-on' : ''}`} onClick={() => setArea(area === a ? '' : a)}>
                  {a}
                </button>
              ))}
            </div>

            <label className="fb-label" htmlFor="fb-msg">{t.ask}</label>
            <textarea
              id="fb-msg"
              className="fb-input"
              rows={4}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t.hint}
            />

            <button className="fb-btn" disabled={!canSend} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
            {error && <p className="fb-error" role="alert">{error}</p>}
            <p className="fb-note">Sent with your device and app version so we can fix it faster. Nothing from your customers is sent.</p>
          </>
        )}
      </div>
    </div>
  );
}
