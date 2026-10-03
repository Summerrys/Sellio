import React from 'react';
import { Mail } from 'lucide-react';

// Sellio accounts are deleted on request (Alvin, 2026-10-03): the person emails
// sellio@apptelier.sg from the address they sign in with, says it's a deletion
// request and why, and Sellio confirms with them before anything is deleted.
export const DELETION_EMAIL = 'sellio@apptelier.sg';

export function deletionRequestMailto(email, shopName) {
  const subject = 'Account deletion request';
  const body = [
    'Please delete my Sellio account.',
    '',
    `Sign-in email: ${email || ''}`,
    `Shop or business name (if any): ${shopName || ''}`,
    '',
    'Why I want to delete it:',
    '',
    '',
  ].join('\n');
  return `mailto:${DELETION_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function AccountDeletionRequest({ email, shopName }) {
  return (
    <div className="space-y-3 text-sm text-slate-600" data-testid="account-deletion-request">
      <p>
        To delete your Sellio account, email{' '}
        <a className="font-semibold text-slate-900 underline" href={`mailto:${DELETION_EMAIL}`}>{DELETION_EMAIL}</a>{' '}
        from the email address you sign in with. Tell us it&apos;s a deletion request and why you&apos;d like your account deleted.
      </p>
      <p>We&apos;ll reply to confirm with you before anything is deleted. Nothing is deleted from this screen.</p>
      {email && <p className="text-xs text-slate-500">Your sign-in email: <strong className="text-slate-700">{email}</strong></p>}
      <a
        href={deletionRequestMailto(email, shopName)}
        className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-lg text-sm font-semibold text-white"
        style={{ background: '#0f172a' }}
      >
        <Mail className="w-4 h-4" /> Email us
      </a>
    </div>
  );
}
