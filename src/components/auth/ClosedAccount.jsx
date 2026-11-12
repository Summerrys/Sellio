import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { callClosedAccount, closedAccountMessage } from '@/lib/closedAccount';
import { useAppText, appT, appLocale } from '@/lib/appText';

// What someone sees when they sign in to a closed account (Alvin, 5 Nov 2026): their account
// is closed (they asked to delete it) and when it will be deleted for good, their shop's page
// shows "Store unavailable", and two choices:
//   Keep my account: it opens again straight away, with its shop and staff, and Sellio's
//   admins are told. Afterwards "Continue" signs them in (onRestored), or they sign in again.
//   Start again: it is deleted now, for good, with any shop it owns and that shop's staff
//   logins, so the phone number or email can sign up again. DELETE must be typed first.
//   Afterwards "Sign up again" starts a new account (onStartOver, or the sign-up page).
// A staff login closed because its shop's owner closed their account only sees that.
// `proof` is how they signed in: { phone, password }, Google's { googleIdToken, nonce } in
// the Android app, or an emailed link's { emailTokenHash, emailLinkType } (Join); the
// closed-account server checks it again for each choice. `email`: the account's email, when
// the proof was an emailed link.
// `web` (no proof): Google on the website, where Sellio can't check who it is; they're sent
// to verify their email instead, whose link opens this screen with the choices.

const SUPPORT_EMAIL = 'sellio@apptelier.sg';
const PRIMARY = { background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' };

function longDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(appLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : null;
}

const listShops = (shops) => (shops.length > 1 ? appT('{shops} and {last}', { shops: shops.slice(0, -1).join(', '), last: shops[shops.length - 1] }) : shops[0]);

function BackButton({ onBack, children }) {
  const { t } = useAppText();
  return (
    <button
      type="button"
      onClick={onBack}
      className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
    >
      {children ?? t('Back to sign in')}
    </button>
  );
}

const SIGN_UP_LINK = 'w-full inline-flex items-center justify-center py-3 rounded-xl text-white font-semibold text-sm';

export default function ClosedAccount({ proof = null, closed = null, web = false, email = '', onBack, onStartOver, onRestored }) {
  const { t } = useAppText();
  const [step, setStep] = useState('closed'); // closed | confirm | restored | deleted
  const [busy, setBusy] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const kind = closed?.kind || 'member';
  const shops = Array.isArray(closed?.shops) ? closed.shops.filter(Boolean) : [];
  const deleteOn = longDate(closed?.deleteAfter);

  const choose = async (action) => {
    if (!proof || busy) return;
    setBusy(action);
    try {
      const reply = await callClosedAccount({ ...proof, action, ...(action === 'delete' ? { confirmation } : {}) });
      if (reply?.ok && action === 'restore') {
        setStep('restored');
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
            <p className="text-base font-semibold text-slate-800">{t('This account is closed')}</p>
            <p className="text-sm text-slate-600 mt-1">{t('The Sellio account for this Google account is closed, and will be deleted for good.')}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          {t('To keep it, or to delete it now and start again, verify this Google address by email: the link in that email takes you to your choices. You can also sign in with your phone number and password.')}
        </p>
        <Link to="/Join" className={SIGN_UP_LINK} style={PRIMARY}>{t('Verify my email')}</Link>
        <p className="text-xs text-slate-500">
          {t('Questions:')}{' '}<a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-slate-700 underline">{SUPPORT_EMAIL}</a>
        </p>
        <BackButton onBack={onBack} />
      </div>
    );
  }

  if (step === 'restored') {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-semibold text-slate-800">{t('Your account is open again')}</p>
            <p className="text-sm text-slate-600 mt-1">
              {shops.length > 0
                ? t('{listShops} is open again: its page is back, it takes orders and its staff can sign in.', { listShops: listShops(shops) })
                : t('It won’t be deleted. You can use Sellio as before.')}
            </p>
          </div>
        </div>
        {onRestored ? (
          <button type="button" onClick={onRestored} className={SIGN_UP_LINK} style={PRIMARY}>{t('Continue')}</button>
        ) : (
          <button type="button" onClick={onBack} className={SIGN_UP_LINK} style={PRIMARY}>{t('Sign in')}</button>
        )}
      </div>
    );
  }

  if (step === 'deleted') {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-semibold text-slate-800">{t('Your account has been deleted')}</p>
            <p className="text-sm text-slate-600 mt-1">
              {shops.length > 0 ? t('{listShops} and its staff logins have been deleted too.', { listShops: listShops(shops) }) + ' ' : ''}
              {email
                ? <>{t('You can sign up again with {email} now, and open a new shop.', { email: <span className="font-medium text-slate-800 break-all">{email}</span> })}</>
                : t('You can sign up again with the same phone number or email now, and open a new shop.')}
            </p>
          </div>
        </div>
        {onStartOver ? (
          <button type="button" onClick={onStartOver} className={SIGN_UP_LINK} style={PRIMARY}>{t('Sign up again')}</button>
        ) : (
          <Link to="/Join" className={SIGN_UP_LINK} style={PRIMARY}>{t('Sign up again')}</Link>
        )}
        <BackButton onBack={onBack}>{t('Done')}</BackButton>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div>
          <p className="text-base font-semibold text-slate-800">{t('Start again')}</p>
          <p className="text-sm text-slate-600 mt-1">
            {shops.length > 0
              ? t('Your account, {listShops} and its staff logins will be deleted now, for good. This can\'t be undone. Afterwards you can sign up again with the same phone number or email.', { listShops: listShops(shops) })
              : t('Your account will be deleted now, for good. This can\'t be undone. Afterwards you can sign up again with the same phone number or email.')}
          </p>
        </div>
        <div>
          <label htmlFor="closed-account-confirmation" className="block text-sm font-medium text-slate-700 mb-1">{t('Type DELETE to confirm')}</label>
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
          {busy === 'delete' ? t('Deleting…') : t('Delete for good')}
        </button>
        <BackButton onBack={() => { setConfirmation(''); setStep('closed'); }}>{t('Cancel')}</BackButton>
      </div>
    );
  }

  if (kind === 'staff') {
    return (
      <div data-testid="closed-account" className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-semibold text-slate-800">{t('This staff login is closed')}</p>
            <p className="text-sm text-slate-600 mt-1">
              {shops.length > 0
                ? t('{listShops}\'s owner closed their account, so this login can\'t sign in.', { listShops: listShops(shops) })
                : t('The shop\'s owner closed their account, so this login can\'t sign in.')}
              {deleteOn ? ' ' + t('It will be deleted on {deleteOn} unless the shop is restored.', { deleteOn }) : ''}
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
          <p className="text-base font-semibold text-slate-800">{t('This account is closed')}</p>
          <p className="text-sm text-slate-600 mt-1">
            {t('You asked to delete it.')}{deleteOn ? ' ' + t('It will be deleted for good on {deleteOn}.', { deleteOn }) : ''}
          </p>
          {shops.length > 0 && (
            <p className="text-sm text-slate-600 mt-1">
              {t('{listShops} is closed too: its page shows “Store unavailable”, it takes no orders and its staff can\'t sign in.', { listShops: listShops(shops) })}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => choose('restore')}
        className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70"
        style={PRIMARY}
      >
        {busy === 'restore' ? t('Opening it again…') : t('Keep my account')}
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => setStep('confirm')}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 bg-white hover:bg-red-50 transition-colors"
      >
        {t('Start again')}
      </button>
      <p className="text-xs text-slate-500">
        {shops.length > 0
          ? t('Keep my account opens it again now, with your shop. Start again deletes it now, for good, with your shop, so you can sign up again.')
          : t('Keep my account opens it again now. Start again deletes it now, for good, so you can sign up again.')}
      </p>
      <BackButton onBack={onBack} />
    </div>
  );
}
