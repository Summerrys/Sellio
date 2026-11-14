import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, BellOff, LogOut } from 'lucide-react';
import NoticeSheet from './NoticeSheet';
import { useAppText } from '@/lib/appText';
import { useOnline } from '@/lib/network';
import { isNativeApp } from '@/lib/nativeApp';
import { cookieUtils } from '@/lib/AppUserContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { listShopCarts } from '@/lib/shopCart';
import { createPageUrl } from '@/utils';
import { SIGNED_OUT_EVENT, readSignedOutNotice, saveSignedOutNotice } from '@/lib/signOutWatch';

// The sign-in pages: the notice waits there (that's where it sends people).
const SIGN_IN_PAGE = /^\/(auth|join)(\/|$)/i;

// Items not sent from the Counter, kept for this person (Counter.jsx keeps them per shop and
// person: sessionStorage "sellio_counter_drafts:<shop>:<app_users id>", { ticket: [{ qty }] }).
export function counterItemsKept(personId, session = globalThis.sessionStorage) {
  if (!personId || !session) return 0;
  let count = 0;
  try {
    for (let i = 0; i < session.length; i += 1) {
      const key = session.key(i) || '';
      if (!key.startsWith('sellio_counter_drafts:') || !key.endsWith(`:${personId}`)) continue;
      const tickets = JSON.parse(session.getItem(key) || '{}');
      if (!tickets || typeof tickets !== 'object') continue;
      for (const lines of Object.values(tickets)) {
        if (Array.isArray(lines)) count += lines.reduce((sum, line) => sum + (Number(line?.qty) || 0), 0);
      }
    }
  } catch { /* storage unavailable */ }
  return count;
}

// "Still on this phone": the lines that apply.
export function keptOnDevice(notice, pathname, t) {
  const kept = [];
  const counter = counterItemsKept(notice?.id);
  if (counter === 1) kept.push(t('1 item not sent from the Counter'));
  else if (counter > 1) kept.push(t('{count} items not sent from the Counter', { count: counter }));

  const carts = listShopCarts();
  const here = /^\/(?:store|order)\/([^/?#]+)/.exec(pathname || '')?.[1];
  const current = here ? carts.find((cart) => cart.slug === decodeURIComponent(here)) : null;
  const cart = current || (carts.length === 1 ? carts[0] : null);
  if (cart) {
    const items = cart.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    const shop = cart.shop?.name;
    if (shop) kept.push(items === 1 ? t('Your cart at {shop} (1 item)', { shop }) : t('Your cart at {shop} ({count} items)', { shop, count: items }));
    else kept.push(items === 1 ? t('Your cart (1 item)') : t('Your cart ({count} items)', { count: items }));
  } else if (carts.length > 1) {
    kept.push(t('Your carts at {count} shops', { count: carts.length }));
  }
  return kept;
}

// "You've been signed out" (UX state 8), once, on whichever page Sellio is on when its sign-in
// ended by itself (src/lib/signOutWatch.js): what's still kept, and for a shop's people that
// new orders won't show or ring here. Sign in again goes to the sign-in page (a shop page or
// listing opens again afterwards: authNavigation.js); Not now leaves a small "Signed out · Sign
// in" pill where "You're offline" shows, until the next sign-in or the next start.
export default function SignedOutNotice() {
  const { t } = useAppText();
  const { pathname, search } = useLocation();
  const online = useOnline();
  const [notice, setNotice] = useState(() => readSignedOutNotice());

  useEffect(() => {
    const update = () => setNotice(readSignedOutNotice());
    const fromOtherTab = (event) => { if (event.key === null || event.key === 'sellio.signedOut') update(); };
    window.addEventListener(SIGNED_OUT_EVENT, update);
    window.addEventListener('storage', fromOtherTab);
    update();
    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, update);
      window.removeEventListener('storage', fromOtherTab);
    };
  }, []);

  const signIn = useCallback(() => {
    rememberReturnPath(`${pathname}${search}`);
    saveSignedOutNotice(null);
    // Sellio's record of who's signed in goes too (Supabase's sign-in is gone already), so the
    // sign-in page opens on its own; nothing else is touched.
    cookieUtils.clear();
    window.location.assign(createPageUrl('Auth'));
  }, [pathname, search]);
  const notNow = useCallback(() => {
    const current = readSignedOutNotice();
    if (current) saveSignedOutNotice({ ...current, seen: true });
  }, []);

  if (!notice || SIGN_IN_PAGE.test(pathname)) return null;
  const app = isNativeApp();

  if (notice.seen) {
    return (
      <button
        type="button"
        onClick={signIn}
        data-testid="signed-out-pill"
        className="fixed left-1/2 z-[36] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold text-white"
        // Above "You're offline" (ConnectionStatus) while that shows.
        style={{ bottom: `calc(${online ? 88 : 132}px + env(safe-area-inset-bottom, 0px))`, background: '#0f172a', boxShadow: '0 8px 20px -8px rgba(15,23,42,.5)' }}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span>{t('Signed out')} · <span className="underline">{t('Sign in')}</span></span>
      </button>
    );
  }

  const kept = keptOnDevice(notice, pathname, t);
  return (
    <NoticeSheet
      open
      onClose={notNow}
      testId="signed-out-notice"
      icon={<LogOut className="h-[26px] w-[26px]" strokeWidth={2} />}
      title={t('You’ve been signed out')}
      primary={{ label: t('Sign in again'), testId: 'signed-out-sign-in', onClick: signIn }}
      secondary={{ label: t('Not now'), testId: 'signed-out-not-now', onClick: notNow }}
    >
      <p className="mb-3">
        {app ? t('Sellio signed you out on this phone. Sign in again to carry on.') : t('Sellio signed you out in this browser. Sign in again to carry on.')}
      </p>
      {kept.length > 0 && (
        <div className="mb-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5" data-testid="signed-out-kept">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {app ? t('Still on this phone') : t('Still in this browser')}
          </p>
          {kept.map((line) => (
            <p key={line} className="flex items-center gap-2 py-0.5 text-[13.5px] text-slate-700">
              <Check className="h-4 w-4 shrink-0 text-green-600" strokeWidth={2.5} aria-hidden="true" />
              {line}
            </p>
          ))}
        </div>
      )}
      {notice.shop && (
        <p className="mb-1 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[13px] leading-snug" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }} data-testid="signed-out-orders">
          <BellOff className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
          {app ? t('New orders won’t show or ring on this phone until you sign in again.') : t('New orders won’t show or ring in this browser until you sign in again.')}
        </p>
      )}
    </NoticeSheet>
  );
}
