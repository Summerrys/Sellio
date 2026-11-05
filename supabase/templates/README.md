# Sellio's sign-in emails (Supabase Auth)

Made by `scripts/email-templates.py` (change them there, then run it). Supabase sends these
emails, and they live in the Supabase dashboard, not in the database, so they are pasted in by
hand (Alvin, 5 Nov 2026: "a professional email signup link than the 'Your Magic Link' format").

Supabase dashboard → Authentication → Emails → Templates. For each template below: set the
Subject, paste the file's whole contents into the message body (Source), and Save.

| Template in the dashboard | Subject                         | File                  |
|---------------------------|---------------------------------|-----------------------|
| Magic Link                | Your Sellio sign-in link        | `magic-link.html`     |
| Confirm signup            | Confirm your email for Sellio   | `confirm-signup.html` |
| Reset Password            | Reset your Sellio password      | `reset-password.html` |

Who gets which:

- **Magic Link**: "Email me a sign-in link" on Join, for an existing account and, because new
  accounts here are confirmed at once ("Confirm email" off), for a new email address too.
- **Confirm signup**: only sent if "Confirm email" is turned on.
- **Reset Password**: Forgot password (phone sign-in), sent to the account's email.

The links go straight to sellio.sg with the link's token (`token_hash`); Join and Auth exchange
it there (`verifyOtp`). So the email shows Sellio's own address, a mail scanner that opens the
link doesn't use it up, on Android the link opens Sellio's app (sellio.sg/Join and /Auth are
app links), and a link to a closed account opens the closed-account screen (Keep my account /
Start again). Supabase's default links (`{{ .ConfirmationURL }}`) went to Supabase first, then
on to the sign-in's redirect address.

Every link goes to sellio.sg, wherever the sign-in was started (the old Base44 app, localhost).

The logo is `public/branding/sellio-logo-email.png` (144×168, shown at 72×84).

Not used by Sellio, so left as Supabase's own: Invite user, Change Email Address,
Reauthentication.
