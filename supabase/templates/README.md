# Sellio's account emails (Supabase Auth)

Made by `scripts/email-templates.py` (change them there, then run it). Supabase sends these
emails, and they live in the Supabase dashboard, not in the database, so they are pasted in by
hand (Alvin, 5 Nov 2026: a professional "Verify my email" email, not Supabase's "Your Magic
Link").

Supabase dashboard → Authentication → Emails → Templates. For each template below: paste the
subject file's line into Subject, paste the file's whole contents into the message body
(Source), and Save.

| Template in the dashboard | Subject (paste)                      | File                       |
|---------------------------|--------------------------------------|----------------------------|
| Magic Link                | `verify-email.subject.txt`           | `verify-email.html`        |
| Confirm signup            | `verify-email-signup.subject.txt`    | `verify-email-signup.html` |
| Reset Password            | `reset-password.subject.txt`         | `reset-password.html`      |

The Magic Link subject and body each have two versions (Go template `{{ if eq .RedirectTo
"https://sellio.sg/Auth" }}…{{ else }}…{{ end }}`): the login page's sign-in code, or the
verify email. Paste them whole, `{{ … }}` included.

Who gets which:

- **Verify your email** (the Magic Link template): "Send verification email" on Join. New
  accounts here are confirmed at once ("Confirm email" is off), so Supabase sends its Magic
  Link template to a new address too, not Confirm signup. An address that already has an
  account is signed in by the same link; one whose account is closed gets the closed-account
  screen (Keep my account / Start again).
- **Your sign-in code** (the Magic Link template too, Alvin 17 Nov 2026): "Email me a code" on
  the login page (Auth, Email). The login page asks Supabase for the email with
  https://sellio.sg/Auth as its redirect, which picks this version: the 6-digit code
  (`{{ .Token }}`) to type in, in the subject and the email, and no link. Supabase's Email
  OTP Length must stay 6 (Authentication → Sign In / Providers → Email): the login page has
  six boxes. A closed account's code opens the closed-account screen (its code's hash is the
  same as the link's token_hash).
- **Confirm signup**: the same email, only sent if "Confirm email" is ever turned on.
- **Reset Password**: Forgot password (phone sign-in), sent to the account's email.

The emails say the link is valid for 1 hour: Supabase's Email OTP Expiration must be 3600
seconds (Authentication → Sign In / Providers → Email), which is also what the closed-account
check allows (`closed_account_by_email_link`).

The links go straight to sellio.sg with the link's token (`token_hash`); Join and Auth exchange
it there (`verifyOtp`). So the email shows Sellio's own address, a mail scanner that opens the
link is much less likely to use it up, on Android the link opens Sellio's app (sellio.sg/Join
and /Auth are app links), and a link to a closed account opens the closed-account screen.
Supabase's default links (`{{ .ConfirmationURL }}`) went to Supabase first, then on to the
sign-in's redirect address. Every link goes to sellio.sg, wherever the sign-in was started
(localhost, say).

Look (Alvin, 6 Nov 2026): the button, colours, warning box and footer of the reset email he
already had (orange button, orange-pink-purple bar, "Sent by Sellio · Powered by Apptelier");
the rest is this layout.

Images, on sellio.sg: `public/branding/sellio-logo-email.png` (144×168, shown 55×64) and the
icons `email-icon-mail.png`, `email-icon-key.png` (128×128, shown 64×64).

Not used by Sellio, so left as Supabase's own: Invite user, Change Email Address,
Reauthentication.
