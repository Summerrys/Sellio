import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { callClosedAccount, closedAccountMessage } from '@/lib/closedAccount';

// What someone sees when they sign in to a closed account (Alvin, 5 Nov 2026): their account
// is closed (they asked to delete it) and when it will be deleted for good, their shop's page
// shows "Store unavailable", and two choices:
//   Keep my account: Sellio's admins are asked to restore it (restoring needs Sellio).
//   Start again: it is deleted now, for good, with any shop it owns and that shop's staff
//   logins, so the phone number or email can sign up again. DELETE must be typed first.
//   Afterwards "Sign up again" starts a new account (onStartOver, or the sign-up page).
// A staff login closed because its shop's owner closed their account only sees that.
// `proof` is how they signed in: { phone, password }, Google's { googleIdToken, nonce } in
// the Android app, or an emailed link's { emailTokenHash, emailLinkType } (Join); the
// closed-account server checks it again for each choice. `email`: the account's email, when
// the proof was an emailed link.
// `web` (no proof): Google on the website, where Sellio can't check who it is; they're sent
// to get a sign-in link by email instead, which opens this screen with the choices.

const SUPPORT_EMAIL = 'sellio@apptelier.sg';
const PRIMARY = { background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' };

function longDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? format(date, 'd MMMM yyyy') : null;
}

const listShops = (shops) => (shops.length > 1 ? `${shops.slice(0, -1).join(', ')} and ${shops[shops.length - 1]}` : shops[0]);

function BackButton({ onBack, children = 'Back to sign in' }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
    >
      {children}
    </button>
  );
}

const SIGN_UP_LINK = 'w-full inline-flex items-center justify-center py-3 rounded-xl text-white font-semibold text-sm';

export default function ClosedAccount({ proof = null, closed = null, web = false, email = '', onBack, onStartOver }) {
  const [step, setStep] = useState('closed'); // closed | confirm | restore_asked | deleted
  const [busy, setBusy] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [alreadyAsked, setAlreadyAsked] = useState(Boolean(closed?.restoreAsked));

  const kind = closed?.kind || 'member';
  const shops = Array.isArray(closed?.shops) ? closed.shops.filter(Boolean) : [];
  const deleteOn = longDate(closed?.deleteAfter);

  const choose = async (action) => {
    if (!proof || busy) return;
    setBusy(action);
    try {
      const reply = await callClosedAccount({ ...proof, action, ...(action === 'delete' ? { confirmation } : {}) });
      if (reply?.ok && action === 'restore') {
        setAlreadyAsked(true);
        setStep('restore_asked');
      } else if (reply?.ok && action === 'delete') {
        setStep('deleted');
      } else {
        toast.error(closedAccountMessage(reply));
        if (['invalid', 'link_invalid', 'not_closed'].includes(reply?.code)) onBack();
      }
    } finally {
      setBusy('');
    }
  };

  if (web) {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-semibold text-slate-800">This account is closed</p>
            <p className="text-sm text-slate-600 mt-1">The Sellio account for this Google account is closed, and will be deleted for good.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          To keep it, or to delete it now and start again, open a sign-in link we email to this Google address.
          You can also sign in with your phone number and password.
        </p>
        <Link to="/Join" className={SIGN_UP_LINK} style={PRIMARY}>Email me a sign-in link</Link>
        <p className="text-xs text-slate-500">
          Questions: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-slate-700 underline">{SUPPORT_EMAIL}</a>
        </p>
        <BackButton onBack={onBack} />
      </div>
    );
  }

  if (step === 'restore_asked') {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-semibold text-slate-800">We&apos;ve asked Sellio to restore your account</p>
            <p className="text-sm text-slate-600 mt-1">
              You&apos;ll be able to sign in again once it&apos;s restored{shops.length > 0 ? ', and your shop will open again' : ''}.
              Questions: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-slate-800 underline">{SUPPORT_EMAIL}</a>
            </p>
          </div>
        </div>
        <BackButton onBack={onBack} />
      </div>
    );
  }

  if (step === 'deleted') {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-semibold text-slate-800">Your account has been deleted</p>
            <p className="text-sm text-slate-600 mt-1">
              {shops.length > 0 ? `${listShops(shops)} and its staff logins have been deleted too. ` : ''}
              {email
                ? <>You can sign up again with <span className="font-medium text-slate-800 break-all">{email}</span> now, and open a new shop.</>
                : 'You can sign up again with the same phone number or email now, and open a new shop.'}
            </p>
          </div>
        </div>
        {onStartOver ? (
          <button type="button" onClick={onStartOver} className={SIGN_UP_LINK} style={PRIMARY}>Sign up again</button>
        ) : (
          <Link to="/Join" className={SIGN_UP_LINK} style={PRIMARY}>Sign up again</Link>
        )}
        <BackButton onBack={onBack}>Done</BackButton>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div>
          <p className="text-base font-semibold text-slate-800">Start again</p>
          <p className="text-sm text-slate-600 mt-1">
            Your account{shops.length > 0 ? `, ${listShops(shops)} and its staff logins` : ''} will be deleted now, for good.
            This can&apos;t be undone. Afterwards you can sign up again with the same phone number or email.
          </p>
        </div>
        <div>
          <label htmlFor="closed-account-confirmation" className="block text-sm font-medium text-slate-700 mb-1">Type DELETE to confirm</label>
          <input
            id="closed-account-confirmation"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <button
          type="button"
          disabled={confirmation !== 'DELETE' || Boolean(busy)}
          onClick={() => choose('delete')}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete for good'}
        </button>
        <BackButton onBack={() => { setConfirmation(''); setStep('closed'); }}>Cancel</BackButton>
      </div>
    );
  }

  if (kind === 'staff') {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-semibold text-slate-800">This staff login is closed</p>
            <p className="text-sm text-slate-600 mt-1">
              {shops.length > 0 ? `${listShops(shops)}'s owner` : "The shop's owner"} closed their account, so this login can&apos;t sign in.
              {deleteOn ? ` It will be deleted on ${deleteOn} unless the shop is restored.` : ''}
            </p>
          </div>
        </div>
        <BackButton onBack={onBack} />
      </div>
    );
  }

  return (
    <div data-testid="closed-account" className="space-y-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-base font-semibold text-slate-800">This account is closed</p>
          <p className="text-sm text-slate-600 mt-1">
            You asked to delete it.{deleteOn ? ` It will be deleted for good on ${deleteOn}.` : ''}
          </p>
          {shops.length > 0 && (
            <p className="text-sm text-slate-600 mt-1">
              {listShops(shops)} is closed too: its page shows &ldquo;Store unavailable&rdquo;, it takes no orders and its staff can&apos;t sign in.
            </p>
          )}
        </div>
      </div>
      {alreadyAsked && (
        <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2">You&apos;ve asked Sellio to restore it. You&apos;ll be able to sign in once it&apos;s restored.</p>
      )}
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => choose('restore')}
        className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70"
        style={PRIMARY}
      >
        {busy === 'restore' ? 'Please wait…' : 'Keep my account'}
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => setStep('confirm')}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 bg-white hover:bg-red-50 transition-colors"
      >
        Start again
      </button>
      <p className="text-xs text-slate-500">
        Keep my account asks Sellio to restore it{shops.length > 0 ? ' and open your shop again' : ''}.
        Start again deletes it now, for good{shops.length > 0 ? ', with your shop' : ''}, so you can sign up again.
      </p>
      <BackButton onBack={onBack} />
    </div>
  );
}
