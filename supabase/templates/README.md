# Sellio's account emails (Supabase Auth)

Made by `scripts/email-templates.py` (change them there, then run it). Supabase sends these
emails, and they live in the Supabase dashboard, not in the database, so they are pasted in by
hand (Alvin, 5 Nov 2026: a professional "Verify my email" email, not Supabase's "Your Magic
Link").

Supabase dashboard → Authentication → Emails → Templates. For each template below: set the
Subject, paste the file's whole contents into the message body (Source), and Save.

| Template in the dashboard | Subject                                      | File                       |
|---------------------------|----------------------------------------------|----------------------------|
| Magic Link                | [Sellio] Please verify your email address    | `verify-email.html`        |
| Confirm signup            | [Sellio] Please verify your email address    | `verify-email-signup.html` |
| Reset Password            | Reset your Sellio password                   | `reset-password.html`      |

Who gets which:

- **Verify your email** (the Magic Link template): "Send verification email" on Join. New
  accounts here are confirmed at once ("Confirm email" is off), so Supabase sends its Magic
  Link template to a new address too, not Confirm signup. An address that already has an
  account is signed in by the same link; one whose account is closed gets the closed-account
  screen (Keep my account / Start again).
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
(the old Base44 app, localhost).

Images, on sellio.sg: `public/branding/sellio-logo-email.png` (144×168, shown 64×75) and the
icons `email-icon-verify.png`, `email-icon-reset.png` (128×128, shown 64×64).

Not used by Sellio, so left as Supabase's own: Invite user, Change Email Address,
Reauthentication.
