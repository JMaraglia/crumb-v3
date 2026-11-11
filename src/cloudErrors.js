// file: src/cloudErrors.js
// Cloud sign-in / sync errors in plain words (shared by the Sign In and Cloud screens).
export function plainError(err) {
  const m = String((err && (err.message || err.error_description)) || err || '');
  if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match. Check them and try again.';
  if (/Email not confirmed/i.test(m)) return 'Check your email and tap the confirmation link first, then sign in.';
  // Nov 10: Supabase's sign-up check (0013) refuses emails that aren't approved yet.
  if (/approved for the Crumb beta/i.test(m)) return 'This email isn’t approved for the Crumb beta yet. Join the beta waitlist at CrumbSales.com.';
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/known to be weak|pwned|leaked/i.test(m)) return 'That password has shown up in a data leak somewhere. Pick a different one.';
  if (/Password should (be|contain)/i.test(m) || /weak.?password/i.test(m)) return 'Use at least 8 characters, with a letter, a number and a special character (like ! or #).';
  if (/only request this after|security purposes/i.test(m)) return 'An email was just sent. Wait a minute before asking for another.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries for now. Wait a few minutes and try again.';
  if (/fetch|network|load failed/i.test(m)) return 'Couldn’t reach the cloud. Check your signal and try again.';
  if (/photo storage|indexeddb|InvalidStateError|UnknownError|QuotaExceeded/i.test(m + ' ' + ((err && err.name) || '')))
    return 'This browser isn’t letting Crumb save your data here (Private Browsing can do this). Open Crumb in a regular tab or the Home Screen app.';
  if (m) return m;
  // No message: say what kind of error it was, so it can be tracked down.
  const kind = [err && err.name, err && err.code, err && err.status].filter(Boolean).join(' ');
  return kind ? `Something went wrong (${kind}).` : 'Something went wrong.';
}
