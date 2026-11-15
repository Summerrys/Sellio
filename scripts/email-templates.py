#!/usr/bin/env python3
"""Sellio's Supabase Auth emails. Writes supabase/templates/*.html, which are pasted into the
Supabase dashboard (Authentication -> Emails -> Templates); see supabase/templates/README.md.

Alvin, 5-6 Nov 2026: a professional "Verify my email" email in place of Supabase's "Your Magic
Link" (the IDEKU email was the model), and Join's button says it sends a verification email.
Then (6 Nov) both emails take the button, colours, warning and footer of the reset email he
already had ("Sent by Sellio · Powered by Apptelier"); the rest is this layout (logo, icon,
heading, "Hi there,", text, "Cheers, The Sellio Team", the link to copy).

Every email address that Join sends a link to gets the verify email: Supabase confirms new
accounts at once here, so it sends its "Magic Link" template for new and existing addresses
alike (and "Confirm signup" only if "Confirm email" is ever turned on). Both templates are the
same verify email; only the link's type differs.

The links go straight to sellio.sg with the link's token (token_hash), not through Supabase
first: Join and Auth exchange it there (verifyOtp), so the email shows Sellio's own address, a
mail scanner that opens the link is much less likely to use it up, on Android it opens Sellio's
app (sellio.sg/Join and /Auth are app links), and a link to a closed account opens the
closed-account screen. The link to copy is the button's own link.

Run: python3 scripts/email-templates.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'supabase' / 'templates'

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
# Alvin's reset email: page, bar, text and link colours, the orange button, the warning box.
PAGE = '#f8fafc'
BAR = 'linear-gradient(to right,#fb923c,#e0449a,#8b5cf6)'
BAR_SOLID = '#e0449a'
INK = '#0f172a'
BODY = '#64748b'
MUTED = '#94a3b8'
LINE = '#f1f5f9'
LINK = '#6366f1'
FOOTER_LINK = '#fb923c'
BUTTON = 'linear-gradient(to bottom,#ffaa6e,#fe7824,#e86a1a)'
BUTTON_SOLID = '#fe7824'   # for mail apps that don't draw gradients (Outlook on Windows)
WARN_BG = '#fef9ee'
WARN_LINE = '#fde68a'
WARN_INK = '#92400e'
SITE = 'https://sellio.sg'
LOGO = f'{SITE}/branding/sellio-logo-email.png'   # 144x168, shown at 55x64
SUPPORT = 'sellio@apptelier.sg'

VERIFY = {
    'subject': '[Sellio] Please verify your email address',
    'preheader': 'Confirm your email address to finish setting up your Sellio account.',
    'icon': f'{SITE}/branding/email-icon-mail.png',
    'heading': 'Verify your email to get started',
    'paragraphs': [
        'Thank you for signing up for Sellio!',
        f'To keep your account secure, we just need to confirm that <strong style="color:{INK};">{{{{ .Email }}}}</strong> '
        'belongs to you. Tap the button below. It only takes a second.',
        'Once verified, we’ll guide you through setting up your account and opening your shop.',
    ],
    'button': 'Verify my email',
    'warning': 'This link expires in <strong>1 hour</strong>. If you didn’t sign up for Sellio, '
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
        'icon': f'{SITE}/branding/email-icon-key.png',
        'heading': 'Reset your password',
        'paragraphs': [
            f'We got a request to reset the password for your Sellio account, <strong style="color:{INK};">{{{{ .Email }}}}</strong>. '
            'Tap the button below to choose a new one.',
        ],
        'button': 'Reset Password',
        'link': f'{SITE}/Auth?type=recovery&amp;token_hash={{{{ .TokenHash }}}}',
        'warning': 'This link expires in <strong>1 hour</strong>. If you didn’t request a password reset, '
                   'you can safely ignore this email — your password will not change.',
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
<body style="margin:0;padding:0;background-color:{PAGE};{text}-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{t['preheader']}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{PAGE};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08);">
<tr><td height="4" bgcolor="{BAR_SOLID}" style="height:4px;line-height:4px;font-size:0;background-color:{BAR_SOLID};background-image:{BAR};border-radius:16px 16px 0 0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 20px 32px;border-bottom:1px solid {LINE};">
<a href="{SITE}" target="_blank" style="text-decoration:none;"><img src="{LOGO}" width="55" height="64" alt="Sellio" style="display:block;border:0;outline:none;text-decoration:none;"></a>
</td></tr>
<tr><td align="center" style="padding:32px 36px 4px 36px;">
<img src="{t['icon']}" width="64" height="64" alt="" style="display:block;border:0;outline:none;">
<h1 style="margin:20px 0 0 0;{text}font-size:24px;line-height:32px;font-weight:700;color:{INK};">{t['heading']}</h1>
</td></tr>
<tr><td style="padding:28px 36px 0 36px;">
<p style="margin:0 0 16px 0;{text}font-size:15px;line-height:24px;font-weight:700;color:{INK};">Hi there,</p>
{paragraphs}
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:8px auto 0 auto;">
<tr><td align="center" bgcolor="{BUTTON_SOLID}" style="border-radius:12px;background-color:{BUTTON_SOLID};background-image:{BUTTON};">
<a href="{t['link']}" target="_blank" style="display:inline-block;padding:14px 32px;{text}font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">{t['button']}</a>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
<tr><td style="background-color:{WARN_BG};border:1px solid {WARN_LINE};border-radius:10px;padding:12px 16px;">
<p style="margin:0;{text}font-size:12px;line-height:18px;color:{WARN_INK};">⚠️ {t['warning']}</p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:28px 0 0 0;"><div style="border-top:1px solid {LINE};height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr></table>
<p style="margin:24px 0 0 0;{text}font-size:15px;line-height:24px;color:{BODY};">Cheers,<br><strong style="color:{INK};">The Sellio Team</strong></p>
<p style="margin:20px 0 6px 0;{text}font-size:12px;line-height:18px;color:{MUTED};">Button not working? Copy and paste this link into your browser:</p>
<p style="margin:0 0 28px 0;{text}font-size:11px;line-height:17px;color:{LINK};word-break:break-all;"><a href="{t['link']}" target="_blank" style="color:{LINK};text-decoration:underline;word-break:break-all;">{t['link']}</a></p>
</td></tr>
<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid {LINE};">
<p style="margin:0;{text}font-size:11px;line-height:18px;color:{MUTED};text-align:center;">Sent by <strong>Sellio</strong> · Powered by Apptelier<br>Need help? <a href="mailto:{SUPPORT}" style="color:{FOOTER_LINK};text-decoration:none;">{SUPPORT}</a></p>
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
