// file: src/CloudTestPage.jsx
// Settings → Cloud Test. Sign up / sign in to Crumb's TEST cloud project and run a connection check:
// save one small test item to the cloud, read it back, and confirm no one else's data is visible.
// Nothing on this phone is uploaded, synced or changed.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { IoCloudOutline, IoCloudDoneOutline } from 'react-icons/io5';
import { cloud, cloudReady, cloudProjectRef, cloudProblem, signOutThisDevice } from './cloud';
import { isRecording, setRecording, pendingCount, pendingChanges, clearOutbox, stuckChanges } from './outbox';
import { isTestDevice, hasRealAccounts, loadDemoData, uploadAll, sendNow, uploadedAt, lastSentAt, lastCheckedAt, lastPullNote, pullNow, joinFromCloud } from './syncSend';
import { syncBlockReason, isTestProject, isRealSynced, setPaused, maySync, BLOCK_TEXT } from './syncMode';
import { checkMove, moveMyData, downloadMyData, COUNT_NAMES } from './syncMove';
import { plainError } from './cloudErrors';
import './CloudTestPage.css';


// One waiting change in plain words: "Customer changed", "Note added", "Stop removed"…
const WHAT = { accounts: 'Account', notes: 'Note', events: 'Calendar event', stops: 'Daily stop', todos: 'To-do', day_marks: 'Daily Stops/Call Sheet marks', settings: 'Setting' };
function describe(c) {
  const what = c.table === 'accounts' && c.cols && c.cols.kind ? (c.cols.kind === 'customer' ? 'Customer' : 'Prospect') : WHAT[c.table] || c.table;
  const name = (c.next && (c.next.name || c.next.title || c.next.text)) || (c.base && (c.base.name || c.base.title || c.base.text)) || '';
  const short = String(name).slice(0, 40);
  const verb = c.type === 'delete' ? 'removed' : c.type === 'convert' ? 'converted to customer' : c.base == null ? 'added' : 'changed';
  const dk = String(c.id).split('|')[1] || '';
  const dd = /^\d{4}-\d{2}-\d{2}$/.test(dk) ? new Date(`${dk}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : dk;
  const day = c.table === 'day_marks' ? ` (${dd})` : c.table === 'settings' ? ` (${c.id})` : '';
  return `${what} ${verb}${short ? `: ${short}` : ''}${day}`;
}

export default function CloudTestPage() {
  const navigate = useNavigate();
  // Opened from a "reset your password" email? (Read before the cloud library tidies the address.)
  const [recovering, setRecovering] = useState(() => /type=recovery/.test(window.location.hash || ''));
  const [linkProblem] = useState(() => {
    const m = /error_description=([^&]+)/.exec(window.location.hash || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  });
  const [newPassword, setNewPassword] = useState('');
  const sb = cloud();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(sb));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [check, setCheck] = useState(null); // { ok, lines: [] }
  const [recording, setRec] = useState(isRecording);
  const [waiting, setWaiting] = useState(null);
  const [recent, setRecent] = useState([]);
  const [stuck, setStuck] = useState([]);
  const [, setTick] = useState(0); // re-draw when sending status changes
  const testCopy = isTestDevice();
  const realData = !testCopy && hasRealAccounts();
  const testProject = isTestProject();
  const realSynced = isRealSynced();
  const why = syncBlockReason();
  const allowed = (s) => Boolean(s && s.user && maySync(s.user.email));
  const [dry, setDry] = useState(null);       // S7 dry run result
  const [moved, setMoved] = useState(null);   // S7 move / download check result

  // Sync step S2: changes noted on this device (nothing is sent yet)
  useEffect(() => {
    const refresh = () => {
      pendingCount().then(setWaiting);
      pendingChanges().then((rows) =>
        setRecent(rows.sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 8))
      );
    };
    const refreshStatus = () => {
      refresh();
      stuckChanges().then(setStuck);
      setTick((n) => n + 1);
    };
    refreshStatus();
    window.addEventListener('crumb-outbox-changed', refresh);
    window.addEventListener('crumb-sync-status', refreshStatus);
    return () => {
      window.removeEventListener('crumb-outbox-changed', refresh);
      window.removeEventListener('crumb-sync-status', refreshStatus);
    };
  }, []);
  const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
  const loadDemo = () =>
    run('Loading demo data…', async () => {
      loadDemoData();
    });
  const upload = () =>
    run('Uploading the demo data…', async () => {
      const r = await uploadAll();
      setMsg(`Uploaded ${r.sent} items to the cloud.${r.conflicts ? ` ${r.conflicts} need review.` : ''}`);
    });
  const sendWaiting = () =>
    run('Sending…', async () => {
      const r = await sendNow();
      if (r.skipped) setMsg('Nothing sent: sign in first.');
      else setMsg(r.sent ? `Sent ${r.sent} change${r.sent === 1 ? '' : 's'}.${r.stuck ? ` ${r.stuck} couldn’t be sent (kept below).` : ''}${r.conflicts ? ` ${r.conflicts} need review.` : ''}` : 'Nothing waiting to send.');
    });
  const checkNow = () =>
    run('Checking the cloud…', async () => {
      const r = await pullNow();
      if (r.skipped) setMsg('Nothing checked: sign in first.');
      else if (r.blocked) setErr(r.blocked);
      else setMsg(r.changed ? 'Brought down changes from your other devices.' : 'Up to date: no changes from your other devices.');
    });
  const join = () =>
    run('Downloading from the test cloud…', async () => {
      await joinFromCloud();
    });
  // ---- S7: your real data
  const checkWhatMoves = () =>
    run('Counting what would move (nothing is sent)…', async () => {
      setMoved(null);
      setDry(await checkMove());
    });
  const moveNow = () =>
    run('Moving your data…', async () => {
      const r = await moveMyData((step) => setBusy(step));
      setMoved(r);
      if (r.ok) setDry(null);
    });
  const downloadNow = () =>
    run('Downloading your data…', async () => {
      const r = await downloadMyData((step) => setBusy(step));
      setMoved(r);
      if (r.ok && r.reload) setTimeout(() => window.location.reload(), 2500); // every screen picks up your data
    });
  const togglePause = () => {
    setPaused(why !== 'paused');
    setTick((n) => n + 1);
    if (why === 'paused') setTimeout(() => pullNow({ quiet: true }), 300); // resumed: catch up now
  };
  const toggleRecording = () => {
    const on = !recording;
    setRecording(on);
    setRec(on);
    if (!on) clearOutbox();
  };

  useEffect(() => {
    if (!sb) return undefined;
    sb.auth.getSession().then(({ data }) => {
      setSession((data && data.session) || null);
      setLoading(false);
    });
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s || null);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data && data.subscription && data.subscription.unsubscribe();
  }, [sb]);

  const run = async (label, fn) => {
    setErr('');
    setMsg('');
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setErr(plainError(e));
    }
    setBusy('');
  };

  const saveNewPassword = () =>
    run('Saving your new password…', async () => {
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setRecovering(false);
      setMsg('Password changed. Use the new one from now on, on every device. Save it in your password manager.');
    });

  const signOut = () =>
    run('Signing out…', async () => {
      await signOutThisDevice(); // this device only; other devices stay signed in
      // Restart so nothing of the old sign-in stays in memory (synced devices land on Sign In, like any app).
      window.location.replace(isRealSynced() ? '/sign-in' : '/cloud-test');
    });

  // The connection check: everything here happens in the cloud only.
  const runCheck = () =>
    run('Checking…', async () => {
      setCheck(null);
      const lines = [];
      const { data: ws, error: e1 } = await sb.from('workspaces').select('id, name, kind');
      if (e1) throw e1;
      if (!ws || ws.length !== 1) throw new Error(`Expected 1 workspace, found ${ws ? ws.length : 0}.`);
      lines.push(`Your workspace: “${ws[0].name}” (${ws[0].kind})`);

      const stamp = new Date().toISOString();
      const { error: e2 } = await sb
        .from('settings')
        .upsert({ workspace_id: ws[0].id, key: 'cloud_test', data: { savedAt: stamp } });
      if (e2) throw e2;
      lines.push('Saved a test item to the cloud');

      const { data: back, error: e3 } = await sb.from('settings').select('data, version').eq('key', 'cloud_test');
      if (e3) throw e3;
      if (!back || back.length !== 1 || back[0].data.savedAt !== stamp) throw new Error('The test item didn’t read back the same.');
      lines.push(`Read it back exactly (saved ${back[0].version} time${back[0].version === 1 ? '' : 's'})`);

      const { data: others, error: e4 } = await sb.from('accounts').select('workspace_id').neq('workspace_id', ws[0].id);
      if (e4) throw e4;
      if (others && others.length) throw new Error('Could see records from another workspace!');
      lines.push('No one else’s data is visible');

      const { error: e5 } = await sb.from('admins').select('user_id').limit(1);
      if (!e5) throw new Error('The admin list should not be readable from the app.');
      lines.push('Admin-only areas are locked');

      setCheck({ ok: true, lines });
    });

  return (
    <div className="cl-page">
      <header className="cl-header">
        <button className="cl-icon-btn" onClick={() => navigate('/settings')} aria-label="Back">
          <FaArrowLeft />
        </button>
      </header>
      <div className="cl-content">
        <h1 className="cl-title">{testProject ? 'Cloud Test' : 'Cloud'}</h1>
        <p className="cl-intro">
          {testProject
            ? 'A test of Crumb’s cloud connection, with made-up demo data only. Your real customers are never sent to the test cloud.'
            : 'Keeps your customers, notes, calendar, daily stops, to-dos and photos the same on your iPhone and iPad. Crumb always keeps a full copy on this device, so it works with no signal.'}
        </p>

        {!cloudReady && (
          <div className="cl-card">
            <div className="cl-status is-off">Not set up yet</div>
            <div className="cl-text">This version of Crumb doesn’t have the cloud settings yet.</div>
          </div>
        )}

        {cloudReady && cloudProblem && (
          <div className="cl-card cl-err">
            The cloud address or key in this version looks wrong, so nothing can sync: {cloudProblem}
          </div>
        )}
        {cloudReady && loading && <div className="cl-card cl-text">Checking sign-in…</div>}

        {cloudReady && !cloudProblem && !loading && !session && (
          <div className="cl-card">
            <div className="cl-status">
              <IoCloudOutline className="cl-status-icon" /> Not signed in
            </div>
            <div className="cl-text">Sign in to keep your iPhone and iPad in sync.</div>
            <div className="cl-actions">
              <button className="cl-btn" onClick={() => navigate('/sign-in', { state: { from: '/cloud-test' } })}>
                Sign In
              </button>
            </div>
          </div>
        )}

        {linkProblem && (
          <div className="cl-card cl-err">That email link didn’t work ({linkProblem}). Links expire after a while: ask for a new one.</div>
        )}
        {cloudReady && !cloudProblem && !loading && session && recovering && (
          <div className="cl-card">
            <div className="cl-status">Set A New Password</div>
            <label className="cl-label" htmlFor="cl-newpass">New password (6+ characters)</label>
            <input
              id="cl-newpass"
              className="cl-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="cl-actions">
              <button className="cl-btn" disabled={newPassword.length < 6 || Boolean(busy)} onClick={saveNewPassword}>
                Save New Password
              </button>
            </div>
          </div>
        )}
        {cloudReady && !cloudProblem && !loading && session && testProject && (
          <div className="cl-card">
            <div className="cl-status is-on">
              <IoCloudDoneOutline className="cl-status-icon" /> Signed in
            </div>
            <div className="cl-text">{session.user && session.user.email}</div>
            <div className="cl-actions">
              <button className="cl-btn" disabled={Boolean(busy)} onClick={runCheck}>
                Run Connection Check
              </button>
              <button className="cl-btn cl-btn-plain" disabled={Boolean(busy)} onClick={signOut}>
                Sign Out
              </button>
            </div>
            {check && check.ok && (
              <div className="cl-check">
                <div className="cl-check-title">Connection Check Passed ✓</div>
                <ul>
                  {check.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {cloudReady && !cloudProblem && !testProject && (
          <>
            <div className="cl-section">Your Data</div>
            {testCopy && <div className="cl-card cl-err">{BLOCK_TEXT['test-copy-locked']}</div>}

            {realSynced && (
              <div className="cl-card">
                <div className={`cl-status ${why ? 'is-off' : 'is-on'}`}>
                  {why === '' ? 'Syncing ✓' : why === 'paused' ? 'Paused' : 'Not syncing'}
                </div>
                {why ? (
                  <div className="cl-text">{BLOCK_TEXT[why] || ''}</div>
                ) : (
                  <div className="cl-text">
                    {waiting ? `Sending ${waiting} change${waiting === 1 ? '' : 's'}…` : 'Up to date.'}
                    {lastCheckedAt() ? ` Last checked ${timeOf(lastCheckedAt())}.` : ''}
                  </div>
                )}
                {!session && <div className="cl-err">Signed out: nothing syncs until you sign in.</div>}
                {lastPullNote() && <div className="cl-err">{lastPullNote()}</div>}
                {(why === '' || why === 'paused') && (
                  <button className="cl-switch-row cl-card-gap" onClick={togglePause} aria-pressed={why === 'paused'}>
                    <span className="cl-switch-text">
                      <span className="cl-switch-label">Pause syncing on this device</span>
                      <span className="cl-switch-sub">Crumb keeps working here; changes wait until you turn this off.</span>
                    </span>
                    <span className={`cl-switch ${why === 'paused' ? 'is-on' : ''}`}>
                      <span className="cl-switch-knob" />
                    </span>
                  </button>
                )}
                {stuck.length > 0 && (
                  <div className="cl-err">
                    {stuck.length} change{stuck.length === 1 ? '' : 's'} couldn’t be sent (kept on this device):
                    <ul className="cl-outbox-list">
                      {stuck.slice(0, 5).map((c) => (
                        <li key={c.key}>{describe(c)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!realSynced && !testCopy && session && !allowed(session) && (
              <div className="cl-card cl-text">
                <strong>Coming soon.</strong> Cloud sync isn’t open for this account yet. Your data stays on this device,
                exactly as before.
              </div>
            )}

            {!realSynced && !testCopy && realData && (!session || allowed(session)) && (
              <div className="cl-card">
                <div className="cl-text">
                  <strong>Move My Data To The Cloud.</strong> Your customers, prospects, notes, calendar, daily stops, to-dos,
                  settings and photos go up to your cloud, so your other devices can get them. Nothing on this device changes.
                </div>
                {!session && <div className="cl-text cl-card-gap">Sign in above first.</div>}
                {session && !dry && !(moved && moved.ok) && (
                  <button className="cl-btn cl-card-gap" disabled={Boolean(busy)} onClick={checkWhatMoves}>
                    Check What Would Move
                  </button>
                )}
                {dry && (
                  <div className="cl-card-gap">
                    <div className="cl-text">
                      <strong>Dry run</strong> (nothing was sent):
                    </div>
                    <ul className="cl-outbox-list">
                      {COUNT_NAMES.map(([k, label]) => (
                        <li key={k}>
                          {label}: <strong>{dry.counts[k]}</strong>
                        </li>
                      ))}
                    </ul>
                    {dry.warnings.map((w) => (
                      <div key={w} className="cl-text cl-card-gap">⚠️ {w}</div>
                    ))}
                    {dry.blockers.map((b) => (
                      <div key={b} className="cl-err">{b}</div>
                    ))}
                    {dry.blockers.length === 0 && (
                      <button className="cl-btn cl-card-gap" disabled={Boolean(busy)} onClick={moveNow}>
                        Move My Data
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!realSynced && !testCopy && !realData && (!session || allowed(session)) && (
              <div className="cl-card">
                <div className="cl-text">
                  <strong>Download My Data.</strong> This device is empty. Sign in above with your account, then bring down
                  everything from your cloud.
                </div>
                <button className="cl-btn cl-card-gap" disabled={Boolean(busy) || !session} onClick={downloadNow}>
                  Download My Data
                </button>
              </div>
            )}

            {moved && (
              <div className={moved.ok ? 'cl-check' : 'cl-card cl-err'}>
                <div className={moved.ok ? 'cl-check-title' : ''}>
                  {moved.ok ? 'Everything Matches ✓  This device is now syncing.' : 'The cloud doesn’t match this device, so syncing was NOT turned on. Nothing on this device changed. Send Claude a screenshot.'}
                </div>
                <ul>
                  {moved.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                  {(moved.problems || []).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {moved.problemCount > (moved.problems || []).length && <li>…and {moved.problemCount - moved.problems.length} more</li>}
                </ul>
              </div>
            )}
          </>
        )}

        {testProject && <>
        <div className="cl-section">Sync Test</div>
        {testCopy && (
          <div className="cl-card cl-testcopy">
            <div className="cl-testcopy-badge">TEST COPY · made-up demo data only</div>
            {!session && <div className="cl-text">Sign in above to send changes.</div>}
            {session && !uploadedAt() && (
              <>
                <div className="cl-text">Step 1: send the demo data to the test cloud. After that, changes you make here are sent automatically.</div>
                <button className="cl-btn" disabled={Boolean(busy)} onClick={upload}>
                  Upload Demo Data
                </button>
              </>
            )}
            {session && uploadedAt() && (
              <>
                <div className="cl-text">
                  Changes here are sent automatically a few seconds after you make them.
                  {lastSentAt() ? ` Last sent: ${timeOf(lastSentAt())}.` : ''}
                </div>
                <div className="cl-text">
                  Changes from your other devices are checked every 30 seconds while Crumb is open.
                  {lastCheckedAt() ? ` Last checked: ${timeOf(lastCheckedAt())}.` : ''}
                </div>
                {lastPullNote() && <div className="cl-err">{lastPullNote()}</div>}
                <div className="cl-actions">
                  <button className="cl-btn cl-btn-plain" disabled={Boolean(busy)} onClick={sendWaiting}>
                    Send Now
                  </button>
                  <button className="cl-btn cl-btn-plain" disabled={Boolean(busy)} onClick={checkNow}>
                    Check Now
                  </button>
                </div>
              </>
            )}
            {stuck.length > 0 && (
              <div className="cl-err">
                {stuck.length} change{stuck.length === 1 ? '' : 's'} couldn’t be sent (kept on this device):
                <ul className="cl-outbox-list">
                  {stuck.slice(0, 5).map((c) => (
                    <li key={c.key}>{describe(c)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {!testCopy && realData && (
          <div className="cl-card cl-text">
            This copy of Crumb has your real customers, so it never sends or receives anything. To test syncing, open
            crumb-v3.vercel.app in Chrome (a separate, empty copy) and use the demo data there.
          </div>
        )}
        {!testCopy && !realData && (
          <div className="cl-card">
            <div className="cl-text">
              This copy of Crumb is empty. Load made-up demo data to turn it into a test copy that can send changes to the test cloud.
            </div>
            <button className="cl-btn" disabled={Boolean(busy)} onClick={loadDemo}>
              Load Demo Data
            </button>
            <div className="cl-text cl-card-gap">
              Already testing on another device? Sign in above with the same test account, then download what’s in the test cloud.
            </div>
            <button className="cl-btn" disabled={Boolean(busy) || !session} onClick={join}>
              Download From Test Cloud
            </button>
          </div>
        )}
        <div className="cl-card cl-card-gap">
          <button className="cl-switch-row" onClick={toggleRecording} aria-pressed={recording} disabled={testCopy}>
            <span className="cl-switch-text">
              <span className="cl-switch-label">Record changes on this device</span>
              <span className="cl-switch-sub">Test only. Notes what you change; nothing is sent anywhere yet.</span>
            </span>
            <span className={`cl-switch ${recording ? 'is-on' : ''}`}>
              <span className="cl-switch-knob" />
            </span>
          </button>
          {recording && (
            <div className="cl-outbox">
              <div className="cl-outbox-count">
                Changes waiting: <strong>{waiting == null ? '…' : waiting}</strong>
              </div>
              {recent.length > 0 && (
                <ul className="cl-outbox-list">
                  {recent.map((c) => (
                    <li key={c.key}>
                      <span className="cl-outbox-what">{describe(c)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="cl-hint">Turning this off clears the list.</div>
            </div>
          )}
        </div>
        </>}

        {cloudReady && !cloudProblem && !testProject && session && (
          <details className="cl-trouble">
            <summary>Troubleshooting</summary>
            <div className="cl-card">
              <div className="cl-text">
                Last sent: {lastSentAt() ? timeOf(lastSentAt()) : 'never'} · Last checked: {lastCheckedAt() ? timeOf(lastCheckedAt()) : 'never'}
              </div>
              <div className="cl-outbox-count cl-card-gap">
                Changes waiting to send: <strong>{waiting == null ? '…' : waiting}</strong>
              </div>
              {realSynced && !why && (
                <div className="cl-actions">
                  <button className="cl-btn cl-btn-plain" disabled={Boolean(busy)} onClick={sendWaiting}>
                    Send Now
                  </button>
                  <button className="cl-btn cl-btn-plain" disabled={Boolean(busy)} onClick={checkNow}>
                    Check Now
                  </button>
                </div>
              )}
              <div className="cl-actions">
                <button className="cl-btn cl-btn-plain" disabled={Boolean(busy)} onClick={runCheck}>
                  Run Connection Check
                </button>
              </div>
              {check && check.ok && (
                <div className="cl-check">
                  <div className="cl-check-title">Connection Check Passed ✓</div>
                  <ul>
                    {check.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="cl-hint">Signed in as {session.user && session.user.email} · Project {cloudProjectRef() || 'unknown'}</div>
            </div>
          </details>
        )}

        {busy && <div className="cl-busy">{busy}</div>}
        {msg && <div className="cl-msg">{msg}</div>}
        {err && <div className="cl-err">{err}</div>}
        {cloudReady && testProject && <div className="cl-foot">Test project: {cloudProjectRef() || 'unknown'}</div>}
      </div>
    </div>
  );
}
