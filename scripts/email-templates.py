#!/usr/bin/env python3
"""Sellio's Supabase Auth emails (Alvin, 5 Nov 2026: "a professional email signup link than
the 'Your Magic Link' format"). Writes supabase/templates/*.html, which are pasted into the
Supabase dashboard (Authentication -> Emails -> Templates); see supabase/templates/README.md.

The links go straight to sellio.sg with the link's token (token_hash), not through Supabase
first: Join and Auth exchange it there (verifyOtp), so the address is Sellio's own, an email
scanner opening the link doesn't use it up, it opens in Sellio's Android app (sellio.sg/Join
and /Auth are app links), and a link to a closed account opens the closed-account screen.

Run: python3 scripts/email-templates.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'supabase' / 'templates'

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
BRAND = '#6D02BD'  # Sellio purple (the logo's awning; Android's sellio_purple)
PAGE = '#f4f1f8'
LINE = '#e9e4f1'
INK = '#1c1530'
BODY = '#4a4458'
MUTED = '#6f687c'
FAINT = '#8c869a'
LOGO = 'https://sellio.sg/branding/sellio-logo-email.png'  # 144x168, shown at 72x84

TEMPLATES = [
    {
        'file': 'magic-link.html',
        'dashboard': 'Magic Link',
        'subject': 'Your Sellio sign-in link',
        'preheader': 'Tap to continue to Sellio. The link works once.',
        'heading': 'Sign in to Sellio',
        'intro': f'Tap the button below to continue to Sellio as <strong style="color:{INK};">{{{{ .Email }}}}</strong>. '
                 'New to Sellio? You’ll set up your account next.',
        'button': 'Continue to Sellio',
        'link': 'https://sellio.sg/Join?token_hash={{ .TokenHash }}&amp;type=magiclink',
        'note': 'For your security, this link works once. If it has expired, ask for a new one in Sellio.',
        'ignore': 'Didn’t ask for this? You can safely ignore this email. Your account stays as it is.',
    },
    {
        'file': 'confirm-signup.html',
        'dashboard': 'Confirm signup',
        'subject': 'Confirm your email for Sellio',
        'preheader': 'One tap to confirm your email and set up your Sellio account.',
        'heading': 'Confirm your email',
        'intro': f'Thanks for joining Sellio. Tap the button below to confirm <strong style="color:{INK};">{{{{ .Email }}}}</strong> '
                 'and set up your account.',
        'button': 'Confirm email',
        'link': 'https://sellio.sg/Join?token_hash={{ .TokenHash }}&amp;type=signup',
        'note': 'For your security, this link works once. If it has expired, ask for a new one in Sellio.',
        'ignore': 'Didn’t sign up for Sellio? You can safely ignore this email.',
    },
    {
        'file': 'reset-password.html',
        'dashboard': 'Reset Password',
        'subject': 'Reset your Sellio password',
        'preheader': 'Choose a new password for your Sellio account.',
        'heading': 'Reset your password',
        'intro': f'We got a request to reset the password for your Sellio account, <strong style="color:{INK};">{{{{ .Email }}}}</strong>. '
                 'Tap the button below to choose a new one.',
        'button': 'Choose a new password',
        'link': 'https://sellio.sg/Auth?type=recovery&amp;token_hash={{ .TokenHash }}',
        'note': 'For your security, this link works once. If it has expired, ask for a new one from Forgot password in Sellio.',
        'ignore': 'Didn’t ask to reset your password? You can safely ignore this email. Your password stays the same.',
    },
]


def page(t):
    text = f'font-family:{FONT};'
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{t['subject']}</title>
</head>
<body style="margin:0;padding:0;background-color:{PAGE};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{t['preheader']}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{PAGE};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td align="center" style="padding:0 0 20px 0;">
<a href="https://sellio.sg" target="_blank" style="text-decoration:none;"><img src="{LOGO}" width="72" height="84" alt="Sellio" style="display:block;border:0;outline:none;text-decoration:none;"></a>
</td></tr>
<tr><td style="background-color:#ffffff;border:1px solid {LINE};border-radius:16px;padding:36px 32px;">
<h1 style="margin:0 0 12px 0;{text}font-size:22px;line-height:30px;font-weight:700;color:{INK};">{t['heading']}</h1>
<p style="margin:0 0 24px 0;{text}font-size:15px;line-height:24px;color:{BODY};">{t['intro']}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" bgcolor="{BRAND}" style="border-radius:10px;background-color:{BRAND};">
<a href="{t['link']}" target="_blank" style="display:inline-block;padding:14px 28px;{text}font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">{t['button']}</a>
</td></tr>
</table>
<p style="margin:24px 0 0 0;{text}font-size:13px;line-height:20px;color:{MUTED};">{t['note']}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:24px 0 0 0;"><div style="border-top:1px solid {LINE};height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr></table>
<p style="margin:20px 0 0 0;{text}font-size:12px;line-height:18px;color:{FAINT};">{t['ignore']}</p>
<p style="margin:12px 0 0 0;{text}font-size:12px;line-height:18px;color:{FAINT};">Button not working? Copy this link into your browser:<br><a href="{t['link']}" target="_blank" style="color:{BRAND};text-decoration:underline;word-break:break-all;">{t['link']}</a></p>
</td></tr>
<tr><td align="center" style="padding:20px 8px 0 8px;{text}font-size:12px;line-height:18px;color:{FAINT};">
Sellio · Sell from home, or run your business on Sellio<br>
<a href="https://sellio.sg" target="_blank" style="color:{FAINT};text-decoration:underline;">sellio.sg</a> · Questions? <a href="mailto:sellio@apptelier.sg" style="color:{FAINT};text-decoration:underline;">sellio@apptelier.sg</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for t in TEMPLATES:
        (OUT / t['file']).write_text(page(t), encoding='utf-8')
        print('wrote', (OUT / t['file']).relative_to(ROOT), '-', t['dashboard'], '-', t['subject'])


if __name__ == '__main__':
    main()
