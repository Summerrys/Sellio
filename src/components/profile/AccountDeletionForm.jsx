import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { cookieUtils } from '@/lib/AppUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export async function signInForAccountDeletion() {
  sessionStorage.setItem('sellio_deletion_return', '1');
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  cookieUtils.clear();
  window.location.assign('/Auth');
}

export function accountDeletionDestination(fallback) {
  if (sessionStorage.getItem('sellio_deletion_return') !== '1') return fallback;
  sessionStorage.removeItem('sellio_deletion_return');
  return '/delete-account';
}

function readCompletedDeletion() {
  try {
    if (window.location.pathname !== '/delete-account') return null;
    const receipt = JSON.parse(sessionStorage.getItem('sellio_completed_deletion') || 'null');
    return receipt?.status === 'completed' && receipt?.requestId ? receipt : null;
  } catch { return null; }
}

export default function AccountDeletionForm({ expectedEmail, onBusyChange, onCompleted }) {
  const queryClient = useQueryClient();
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [result, setResult] = useState(readCompletedDeletion);
  const lock = useRef(false);

  useEffect(() => {
    if (result?.status === 'completed') {
      sessionStorage.removeItem('sellio_completed_deletion');
      setLoading(false);
      return;
    }
    let mounted = true;
    getSupabase().then(client => client.auth.getUser()).then(({ data, error: authError }) => {
      if (!mounted) return;
      if (authError || !data.user) setNeedsSignIn(true);
      else if (expectedEmail && data.user.email?.toLowerCase() !== expectedEmail.toLowerCase()) {
        setError('Your profile and signed-in account differ. Sign in again before deleting an account.');
        setNeedsSignIn(true);
      } else setIdentity(data.user);
    }).catch(() => { if (mounted) setError('Could not verify your account. Reload and try again.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [expectedEmail]);

  const verifyAgain = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try { await signInForAccountDeletion(); }
    catch (err) {
      setError(err.message || 'Could not open sign-in. Please try again.');
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (lock.current || !identity || confirmation !== 'DELETE') return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setResult(null);
    try {
      const client = await getSupabase();
      // Recheck the identity at submission; the profile cookie is not authentication.
      const { data: verified, error: verificationError } = await client.auth.getUser();
      if (verificationError || verified.user?.id !== identity.id) {
        setNeedsSignIn(true);
        throw new Error('Sign in again to verify this account.');
      }
      const { data, error: invokeError } = await client.functions.invoke('delete-account', { body: { confirmation } });
      if (invokeError) {
        let details;
        try { details = await invokeError.context?.json(); } catch { /* Network failures have no response. */ }
        if (['REAUTH_REQUIRED', 'AUTH_REQUIRED'].includes(details?.code)) setNeedsSignIn(true);
        throw new Error(details?.error ? details.error + (details.requestId ? ' Request: ' + details.requestId : '') : 'Deletion has not been confirmed. Sign in again and retry.');
      }
      if (!data?.requestId || !data?.status) throw new Error('Deletion has not been confirmed. Please retry.');
      setResult(data);
      if (data.status === 'completed') {
        try { sessionStorage.setItem('sellio_completed_deletion', JSON.stringify(data)); } catch { /* Confirmation remains in this view. */ }
        cookieUtils.clear();
        localStorage.removeItem('app_user');
        localStorage.removeItem('app_session');
        queryClient.clear();
        await client.auth.signOut({ scope: 'local' });
        // Keep the confirmation visible until the user leaves this public page.
        setIdentity(null);
        setNeedsSignIn(false);
        onCompleted?.(data);
      }
    } catch (err) {
      setError(err.message || 'Deletion could not be completed. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  if (loading) return <p role="status">Verifying your account…</p>;
  if (result?.status === 'completed') return (
    <div role="status" className="space-y-3">
      <p className="font-semibold">Your Sellio account has been deleted.</p>
      <p className="text-sm text-muted-foreground">Your login, personal profile, notification preferences and store memberships were removed. Shared business records remain with their store.</p>
      <a className="underline" href="/Auth">Return to sign in</a>
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      <p className="text-sm text-muted-foreground">
        Delete your Sellio login, personal profile, notification preferences and store memberships. This cannot be undone. Shared store orders, accounting records and subscriptions are retained; deleting your account does not cancel a store subscription.
      </p>
      {identity && <p className="text-sm">Account: <strong>{identity.email}</strong></p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {result && (
        <div role="status" className="rounded-lg border p-3 space-y-2 text-sm">
          <p className="font-semibold">Deletion request saved: {result.requestId}</p>
          <p>Your account has not been deleted yet.</p>
          {result.status === 'needs_owner_action' && <p>Store ownership must be transferred or the store closed before deletion. Your stores and subscriptions remain unchanged.</p>}
          {result.status === 'needs_asset_action' && <p>Files owned by your account must first be transferred or removed without affecting your store.</p>}
          {result.status === 'needs_admin_action' && <p>Platform administrator access must be reassigned before deletion.</p>}
          {!!result.blockers?.stores?.length && <p>Stores: {result.blockers.stores.map(store => store.name).join(', ')}</p>}
          <p>Contact <a className="underline" href="mailto:sellio@apptelier.sg">sellio@apptelier.sg</a> with this request number to resolve the ownership or file requirement, then retry here.</p>
        </div>
      )}
      {needsSignIn ? (
        <Button type="button" disabled={busy} onClick={verifyAgain}>Sign in again to verify your identity</Button>
      ) : identity && (
        <>
          <div className="space-y-2">
            <Label htmlFor="delete-account-confirmation">Type DELETE to confirm</Label>
            <Input id="delete-account-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" spellCheck={false} />
          </div>
          <Button type="submit" disabled={busy || confirmation !== 'DELETE'} className="bg-red-600 hover:bg-red-700 text-white">
            {busy ? 'Processing deletion…' : 'Delete my account'}
          </Button>
        </>
      )}
    </form>
  );
}
