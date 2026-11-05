#!/usr/bin/env python3
"""Sellio's Supabase Auth emails. Writes supabase/templates/*.html, which are pasted into the
Supabase dashboard (Authentication -> Emails -> Templates); see supabase/templates/README.md.

Alvin, 5 Nov 2026: a professional "Verify my email" email in place of Supabase's "Your Magic
Link" (the IDEKU email was the model), and Join's button says it sends a verification email.
Every email address that Join sends a link to gets the verify email: Supabase confirms new
accounts at once here, so it sends its "Magic Link" template for new and existing addresses
alike (and "Confirm signup" only if "Confirm email" is ever turned on). Both templates are the
same verify email; only the link's type differs.

The links go straight to sellio.sg with the link's token (token_hash), not through Supabase
first: Join and Auth exchange it there (verifyOtp), so the email shows Sellio's own address, a
mail scanner that opens the link is much less likely to use it up, on Android it opens Sellio's
app (sellio.sg/Join and /Auth are app links), and a link to a closed account opens the
closed-account screen.

Run: python3 scripts/email-templates.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'supabase' / 'templates'

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
BRAND = '#6D02BD'        # Sellio purple (the logo's awning; Android's sellio_purple)
BRAND_DEEP = '#55019A'
PAGE = '#f4f1f8'
LINE = '#ece7f3'
INK = '#1c1530'
BODY = '#433d50'
MUTED = '#6f687c'
NOTE_BG = '#faf6ff'
NOTE_LINE = '#e9ddf8'
NOTE_INK = '#5b2a86'
SITE = 'https://sellio.sg'
LOGO = f'{SITE}/branding/sellio-logo-email.png'   # 144x168, shown at 64x75
SUPPORT = 'sellio@apptelier.sg'

VERIFY = {
    'subject': '[Sellio] Please verify your email address',
    'preheader': 'Confirm your email address to finish setting up your Sellio account.',
    'icon': f'{SITE}/branding/email-icon-verify.png',
    'icon_alt': '',
    'heading': 'Verify your email to get started',
    'paragraphs': [
        'Thank you for signing up for Sellio!',
        f'To keep your account secure, we just need to confirm that <strong style="color:{INK};">{{{{ .Email }}}}</strong> '
        'belongs to you. Tap the button below. It only takes a second.',
        'Once verified, we’ll guide you through setting up your account and opening your shop.',
    ],
    'button': 'Verify my email',
    'reminder': 'This link is valid for 1 hour and works once. If you didn’t sign up for Sellio, '
                'you can safely ignore this email.',
}

TEMPLATES = [
    {**VERIFY, 'file': 'verify-email.html', 'dashboard': 'Magic Link',
     'link': f'{SITE}/Join?token_hash={{{{ .TokenHash }}}}&amp;type=magiclink'},
    {**VERIFY, 'file': 'verify-email-signup.html', 'dashboard': 'Confirm signup',
     'link': f'{SITE}/Join?token_hash={{{{ .TokenHash }}}}&amp;type=signup'},
    {
        'file': 'reset-password.html',
        'dashboard': 'Reset Password',
        'subject': 'Reset your Sellio password',
        'preheader': 'Choose a new password for your Sellio account.',
        'icon': f'{SITE}/branding/email-icon-reset.png',
        'icon_alt': '',
        'heading': 'Reset your password',
        'paragraphs': [
            f'We got a request to reset the password for your Sellio account, <strong style="color:{INK};">{{{{ .Email }}}}</strong>. '
            'Tap the button below to choose a new one.',
        ],
        'button': 'Choose a new password',
        'link': f'{SITE}/Auth?type=recovery&amp;token_hash={{{{ .TokenHash }}}}',
        'reminder': 'This link is valid for 1 hour and works once. Didn’t ask to reset your password? '
                    'You can safely ignore this email. Your password stays the same.',
    },
]


def page(t):
    text = f'font-family:{FONT};'
    paragraphs = '\n'.join(
        f'<p style="margin:0 0 16px 0;{text}font-size:15px;line-height:24px;color:{BODY};">{p}</p>'
        for p in t['paragraphs'])
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
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid {LINE};border-radius:16px;border-collapse:separate;overflow:hidden;">
<tr><td height="6" bgcolor="{BRAND}" style="height:6px;line-height:6px;font-size:0;background-color:{BRAND};background-image:linear-gradient(90deg,#ec5568,#a33bd6,{BRAND});border-radius:16px 16px 0 0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:22px 32px 18px 32px;border-bottom:1px solid {LINE};">
<a href="{SITE}" target="_blank" style="text-decoration:none;"><img src="{LOGO}" width="64" height="75" alt="Sellio" style="display:block;border:0;outline:none;text-decoration:none;"></a>
</td></tr>
<tr><td align="center" style="padding:32px 36px 4px 36px;">
<img src="{t['icon']}" width="64" height="64" alt="{t['icon_alt']}" style="display:block;border:0;outline:none;">
<h1 style="margin:20px 0 0 0;{text}font-size:24px;line-height:32px;font-weight:700;color:{INK};">{t['heading']}</h1>
</td></tr>
<tr><td style="padding:28px 36px 0 36px;">
<p style="margin:0 0 16px 0;{text}font-size:15px;line-height:24px;font-weight:700;color:{INK};">Hi there,</p>
{paragraphs}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0 0;">
<tr><td align="center" bgcolor="{BRAND}" style="border-radius:10px;background-color:{BRAND};">
<a href="{t['link']}" target="_blank" style="display:block;padding:15px 24px;{text}font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">{t['button']}</a>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
<tr><td style="background-color:{NOTE_BG};border:1px solid {NOTE_LINE};border-radius:12px;padding:18px 20px;">
<p style="margin:0 0 6px 0;{text}font-size:14px;line-height:20px;font-weight:700;color:{NOTE_INK};">Reminder</p>
<p style="margin:0 0 12px 0;{text}font-size:13px;line-height:20px;color:{NOTE_INK};">{t['reminder']}</p>
<p style="margin:0;{text}font-size:13px;line-height:20px;color:{NOTE_INK};">Have questions? We’re here to help: <a href="mailto:{SUPPORT}" style="color:{NOTE_INK};text-decoration:underline;">{SUPPORT}</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:28px 0 0 0;"><div style="border-top:1px solid {LINE};height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr></table>
<p style="margin:24px 0 0 0;{text}font-size:15px;line-height:24px;color:{BODY};">Cheers,<br><strong style="color:{INK};">The Sellio Team</strong></p>
<p style="margin:20px 0 28px 0;{text}font-size:12px;line-height:18px;color:{MUTED};">Button not working? Copy this link into your browser:<br><a href="{t['link']}" target="_blank" style="color:{BRAND};text-decoration:underline;word-break:break-all;">{t['link']}</a></p>
</td></tr>
<tr><td align="center" bgcolor="{BRAND}" style="background-color:{BRAND};background-image:linear-gradient(135deg,{BRAND},{BRAND_DEEP});padding:24px 28px;border-radius:0 0 16px 16px;">
<p style="margin:0 0 8px 0;{text}font-size:13px;line-height:20px;color:#ffffff;">If you have any questions, contact us at <a href="mailto:{SUPPORT}" style="color:#ffffff;text-decoration:underline;">{SUPPORT}</a></p>
<p style="margin:0 0 8px 0;{text}font-size:13px;line-height:20px;color:#ffffff;"><a href="{SITE}" target="_blank" style="color:#ffffff;text-decoration:underline;">sellio.sg</a></p>
<p style="margin:0;{text}font-size:12px;line-height:18px;color:#e6d4f7;">© Sellio. All rights reserved.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    keep = {t['file'] for t in TEMPLATES}
    for old in OUT.glob('*.html'):
        if old.name not in keep:
            old.unlink()
            print('removed', old.relative_to(ROOT))
    for t in TEMPLATES:
        (OUT / t['file']).write_text(page(t), encoding='utf-8')
        print('wrote', (OUT / t['file']).relative_to(ROOT), '-', t['dashboard'], '-', t['subject'])


if __name__ == '__main__':
    main()
