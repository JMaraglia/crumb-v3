// file: src/cloudErrors.js
// Cloud sign-in / sync errors in plain words (shared by the Sign In and Cloud screens).
export function plainError(err) {
  const m = String((err && (err.message || err.error_description)) || err || '');
  if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match. Check them and try again.';
  if (/Email not confirmed/i.test(m)) return 'Check your email and tap the confirmation link first, then sign in.';
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/Password should be/i.test(m)) return 'Use a longer password (at least 6 characters).';
  if (/only request this after|security purposes/i.test(m)) return 'An email was just sent. Wait a minute before asking for another.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries for now. Wait a few minutes and try again.';
  if (/fetch|network|load failed/i.test(m)) return 'Couldn’t reach the cloud. Check your signal and try again.';
  return m || 'Something went wrong.';
}
