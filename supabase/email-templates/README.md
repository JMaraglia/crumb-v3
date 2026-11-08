# Crumb Email Templates (Supabase Auth)

Paste each file into Supabase: crumb-prod → Authentication → Emails → Templates.

| Supabase template | File | Subject |
|---|---|---|
| Reset Password | reset-password.html | Reset your Crumb password |
| Confirm signup | confirm-signup.html | Confirm your email for Crumb |
| Change Email Address | change-email.html | Confirm your new email for Crumb |

Sent from Crumb <no-reply@crumbsales.com> through Resend (Supabase custom SMTP).
The {{ .ConfirmationURL }}, {{ .Email }} and {{ .NewEmail }} parts are filled in by Supabase. Don't change them.
