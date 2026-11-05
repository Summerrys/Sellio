import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Mail } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { cookieUtils } from '@/lib/AppUserContext';
import { signInForAccountDeletion } from './AccountDeletionForm';

// Deleting a Sellio account (Alvin, 5 Nov 2026), in the app (Me → Delete account, or the
// account panel) and at sellio.sg/delete-account. The delete-account edge function and
// public.account_deletion_request do it at once: the person is signed out everywhere and
// their sign-in locked, a shop they own closes ("Store unavailable", no new orders, off
// Explore) with its staff locked out, its paid plan stops renewing, and the account is
// deleted for good after 6 months for a shop owner (30 days otherwise) unless they sign in
// again and choose Keep my account (it opens again straight away; components/auth/
// ClosedAccount). Afterwards this phone is signed out too and goes to Explore.
// Before 5 Nov 2026 deletion was by email only; the email stays for anyone who can't sign in.
export const DELETION_EMAIL = 'sellio@apptelier.sg';

export function deletionRequestMailto(email, shopName) {
  const subject = 'Account deletion request';
  const body = [
    'Please delete my Sellio account.',
    '',
    `Sign-in email or phone: ${email || ''}`,
    `Shop or business name (if any): ${shopName || ''}`,
    '',
    'Why I want to delete it:',
    '',
    '',
  ].join('\n');
  return `mailto:${DELETION_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Phone sign-ins have a made-up address (…@sellio.app); show their number instead.
function accountLabel(user) {
  const email = user?.email || '';
  if (email && !/@sellio\.app$/i.test(email)) return email;
  if (user?.phone) return `+${String(user.phone).replace(/^\+/, '')}`;
  return email;
}

function deletionDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? format(date, 'd MMMM yyyy') : null;
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// This phone or browser: signed out as well (Sellio has signed the account out everywhere).
async function signOutHere(client) {
  try { await client.auth.signOut({ scope: 'local' }); } catch { /* its session is gone already */ }
  cookieUtils.clear();
  try {
    localStorage.removeItem('app_user');
    localStorage.removeItem('app_session');
  } catch { /* storage unavailable */ }
}

export function WhatHappens() {
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-600" data-testid="deletion-what-happens">
      <li>You&apos;re signed out on every device. Signing in again only shows that the account is closed.</li>
      <li>A shop you own closes straight away: its page shows &ldquo;Store unavailable&rdquo;, it takes no new orders and it leaves Explore. Its staff can&apos;t sign in to it any more.</li>
      <li>If the shop has a paid plan, it won&apos;t renew. Time already paid for isn&apos;t refunded.</li>
      <li>If you work in someone else&apos;s shop, you lose access to it. The shop carries on.</li>
      <li>We keep the account for 6 months if you own a shop, or 30 days if you don&apos;t, in case you change your mind. After that it&apos;s deleted for good, with your shop and its staff logins. Until then, sign in again to keep it (Keep my account: it opens again straight away) or to delete it straight away (Start again).</li>
      <li>Orders you placed stay with the shops you bought from, and billing records are kept as the law requires.</li>
    </ul>
  );
}

export default function AccountDeletionRequest({ email = '', shopName = '', onRequested, onFinished }) {
  const [identity, setIdentity] = useState(undefined); // undefined: checking; null: signed out
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const lock = useRef(false);

  useEffect(() => {
    let mounted = true;
    getSupabase()
      .then((client) => client.auth.getUser())
      .then(({ data, error: authError }) => {
        if (mounted) setIdentity(!authError && data?.user?.id ? data.user : null);
      })
      .catch(() => { if (mounted) setIdentity(null); });
    return () => { mounted = false; };
  }, []);

  const confirmed = confirmation.trim() === 'DELETE';

  const submit = async (event) => {
    event.preventDefault();
    if (lock.current || !identity || !confirmed) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const client = await getSupabase();
      const { data, error: invokeError } = await client.functions.invoke('delete-account', {
        body: { confirmation: 'DELETE', reason: reason.trim() || undefined },
      });
      if (invokeError) {
        let details;
        try { details = await invokeError.context?.json(); } catch { /* no answer (offline) */ }
        if (details?.code === 'AUTH_REQUIRED' || details?.code === 'REAUTH_REQUIRED') {
          setIdentity(null);
          throw new Error('Please sign in again, then ask here.');
        }
        throw new Error(details?.error || `Your request didn't go through. Check your connection and try again, or email ${DELETION_EMAIL}.`);
      }
      if (!data?.requestId) throw new Error(`Your request didn't go through. Please try again, or email ${DELETION_EMAIL}.`);
      await signOutHere(client);
      setResult(data);
      onRequested?.(data);
    } catch (err) {
      setError(err?.message || `Your request didn't go through. Please try again, or email ${DELETION_EMAIL}.`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const finish = () => {
    if (onFinished) onFinished();
    else window.location.replace('/explore'); // no Back into the signed-in pages
  };

  if (result) {
    const shops = Array.isArray(result.shops) ? result.shops.filter(Boolean) : [];
    const when = deletionDate(result.deleteAfter);
    return (
      <div role="status" className="space-y-3 text-sm text-slate-600" data-testid="account-deletion-done">
        <p className="text-base font-semibold text-slate-900">Deletion requested</p>
        <p>You&apos;re signed out{shops.length ? `, and ${joinNames(shops)} ${shops.length === 1 ? 'is' : 'are'} closed now` : ''}.</p>
        <p>
          The account will be deleted for good{when ? ` on ${when}` : ''}. Changed your mind? Sign in again before then
          and choose Keep my account: it opens again straight away{shops.length ? ', with your shop' : ''}.
        </p>
        <button
          type="button"
          onClick={finish}
          className="inline-flex items-center justify-center w-full h-11 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#0f172a' }}
        >
          Continue to Explore
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm text-slate-600" data-testid="account-deletion-request">
      <WhatHappens />

      {identity === undefined && (
        <p role="status" className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Checking your account…</p>
      )}

      {identity === null && (
        <div className="space-y-3">
          <p>Sign in to the account you want to delete, then ask here.</p>
          {error && <p role="alert" className="text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => signInForAccountDeletion().catch(() => setError('Sign-in didn’t open. Please try again.'))}
            className="inline-flex items-center justify-center w-full h-11 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#0f172a' }}
          >
            Sign in to continue
          </button>
          <p className="text-xs text-slate-500">
            Can&apos;t sign in? Email{' '}
            <a className="font-semibold text-slate-700 underline" href={deletionRequestMailto(email, shopName)}>
              <Mail className="inline w-3.5 h-3.5 mr-0.5 -mt-0.5" />{DELETION_EMAIL}
            </a>{' '}
            from the email address on the account, and tell us it&apos;s a deletion request.
          </p>
        </div>
      )}

      {identity && (
        <form onSubmit={submit} className="space-y-3" aria-busy={busy} noValidate>
          <p className="text-xs text-slate-500">Account: <strong className="text-slate-700">{accountLabel(identity) || email}</strong></p>
          <div className="space-y-1">
            <label htmlFor="deletion-reason" className="block text-sm font-medium text-slate-700">Why are you leaving? (optional)</label>
            <textarea
              id="deletion-reason"
              value={reason}
              maxLength={1000}
              rows={3}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="deletion-confirmation" className="block text-sm font-medium text-slate-700">Type DELETE to confirm</label>
            <input
              id="deletion-confirmation"
              value={confirmation}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(event) => setConfirmation(event.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>
          {error && <p role="alert" className="text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !confirmed}
            className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Requesting…' : 'Request deletion'}
          </button>
        </form>
      )}
    </div>
  );
}
