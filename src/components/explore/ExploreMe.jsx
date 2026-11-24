import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, LayoutDashboard, Settings, UserRound, LogOut, ChevronRight, Loader2, Copy, Check, Star, ShoppingBag, Flag, Heart, MessageSquareHeart, Gift, Coins } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { useTenant } from '@/components/tenant/TenantContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { amIModerator, moderationQueue, ratingReviewQueue, ratingText, shopRatingOverview } from '@/lib/ratings';
import { itemWords } from '@/lib/planFeatures';
import { purchaseSummary } from '@/lib/purchases';
import { amISellioAdmin, feedbackSummary } from '@/lib/appFeedback';
import { referralOverview } from '@/lib/referral';
import AccountProfileModal from '@/components/profile/AccountProfileModal';
import PricingModal from '@/components/subscription/PricingModal';
import { ProfileAvatar, ProfilePhotoEditor } from '@/components/profile/ProfilePhoto';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import ShopBell from './ShopBell';
import AppLanguageSwitch from '@/components/ui-custom/AppLanguageSwitch';
import { BRAND_GRADIENT, ExploreTabHeader, LOGO_URL } from './shared';
import { useAppText } from '@/lib/appText';

// Me — the one Me tab for everyone (a free shop's bar opens this same page): the account,
// what they've bought (My purchases), the shop (its link, the Dashboard, Settings) and
// signing in or out.

function Row({ to, href, icon: Icon, label, detail, onClick, pulse = false }) {
  const inner = (
    <>
      <span className="relative w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-[18px] h-[18px] text-slate-600" />
        {pulse && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: BRAND_GRADIENT }} />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: BRAND_GRADIENT }} />
          </span>
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-slate-900">{label}</span>
        {detail && <span className="block text-xs text-slate-500 truncate">{detail}</span>}
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </>
  );
  const className = 'flex items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100';
  if (href) return <a href={href} className={className}>{inner}</a>;
  return <Link to={to} onClick={onClick} className={className}>{inner}</Link>;
}

export default function ExploreMe() {
  const { t, textKey } = useAppText('explore');
  const { appUser, clearAppUser } = useAppUser() || {};
  const { user, tenant, hasPermission, isOwner, subscription, noStore } = useTenant();
  const [signingOut, setSigningOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // The plan window, from the profile window's Upgrade to Business (or Upgrade Plan). Before
  // 10 Nov 2026 Me had none, so that button only closed the profile window.
  const [plansOpen, setPlansOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // The saved sign-in can still name a shop this login no longer has (closed or removed, or
  // its access ended); the memberships just read say so.
  const hasShop = !!appUser?.tenant_id && !noStore;
  // The shop's ratings (its staff who see orders): "4.8 from 12 buyers".
  const canSeeRatings = hasShop && !!tenant?.id && hasPermission('orders.view');
  const [ratings, setRatings] = useState(null); // the overview, or 'failed'
  useEffect(() => {
    if (!canSeeRatings) return undefined;
    let cancelled = false;
    shopRatingOverview(tenant.id).then((o) => { if (!cancelled) setRatings(o || {}); })
      .catch(() => { if (!cancelled) setRatings('failed'); });
    return () => { cancelled = true; };
  }, [canSeeRatings, tenant?.id]);
  let ratingLine = null;
  if (ratings === 'failed') ratingLine = t('See what buyers think');
  else if (ratings) {
    const count = Number(ratings.rating_count) || 0;
    const vars = { rating: ratingText(ratings.rating), count, week: ratings.last_7_days };
    if (!count) ratingLine = t('No ratings yet');
    else if (count === 1) ratingLine = ratings.last_7_days ? t('{rating} from 1 buyer · {week} this week', vars) : t('{rating} from 1 buyer', vars);
    else ratingLine = ratings.last_7_days ? t('{rating} from {count} buyers · {week} this week', vars) : t('{rating} from {count} buyers', vars);
  }

  // My purchases: "2 on the way".
  const [onTheWay, setOnTheWay] = useState(null);
  useEffect(() => {
    if (!appUser) return undefined;
    let cancelled = false;
    purchaseSummary().then((s) => { if (!cancelled) setOnTheWay(Number(s?.ongoing) || 0); })
      .catch(() => { if (!cancelled) setOnTheWay(0); });
    return () => { cancelled = true; };
  }, [appUser]);
  const purchasesLine = onTheWay ? t('{count} on the way', { count: onTheWay }) : null;

  // Sellio's moderators: ratings on hold and reported comments waiting for them.
  const [toCheck, setToCheck] = useState(null); // { held, reported } for a moderator
  useEffect(() => {
    if (!appUser) return undefined;
    let cancelled = false;
    amIModerator().then(async (yes) => {
      if (!yes || cancelled) return;
      const count = (load) => load(0, 100).then((list) => list.length).catch(() => null);
      const [held, reported] = await Promise.all([count(ratingReviewQueue), count(moderationQueue)]);
      if (!cancelled) setToCheck({ held, reported });
    });
    return () => { cancelled = true; };
  }, [appUser]);
  // Sellio's admins: how people rate the Sellio app (Admin → Feedback), and 1–3★ ones not done yet.
  const [appFeedback, setAppFeedback] = useState(null); // { lowOpen } for an admin
  const [sellioAdmin, setSellioAdmin] = useState(false);
  useEffect(() => {
    if (!appUser) return undefined;
    let cancelled = false;
    amISellioAdmin().then(async (yes) => {
      if (!yes || cancelled) return;
      setSellioAdmin(true);
      const lowOpen = await feedbackSummary().then((s) => Number(s?.low_open) || 0).catch(() => null);
      if (!cancelled) setAppFeedback({ lowOpen });
    });
    return () => { cancelled = true; };
  }, [appUser]);
  const feedbackLine = !appFeedback ? null
    : appFeedback.lowOpen === 1 ? t('1 low rating to look at')
      : appFeedback.lowOpen > 1 ? t('{count} low ratings to look at', { count: appFeedback.lowOpen })
        : t('How people rate the Sellio app');
  // Refer & earn (/refer): every shop's owner, free home shops too (Alvin, 24 Nov 2026). The row
  // shows the shop's code (referral_overview makes it the first time), NEW until someone joins.
  const canRefer = hasShop && !!isOwner && !!tenant?.id;
  const [referral, setReferral] = useState(null); // referral_overview's answer
  useEffect(() => {
    if (!canRefer) { setReferral(null); return undefined; }
    let cancelled = false;
    referralOverview(tenant.id).then((answer) => { if (!cancelled) setReferral(answer || null); })
      .catch(() => { if (!cancelled) setReferral(null); });
    return () => { cancelled = true; };
  }, [canRefer, tenant?.id]);
  const showRefer = !!referral?.code;
  const referralNew = !!referral && !(Number(referral.invited?.waiting) + Number(referral.invited?.sellers) + Number(referral.invited?.businesses) > 0);
  const referLine = referral?.code ? t('Your code: {code}', { code: referral.code }) : null;
  let moderation = null;
  if (toCheck) {
    const { held, reported } = toCheck;
    const parts = [
      held ? t('{count} on hold', { count: held }) : '',
      reported ? (reported === 1 ? t('1 reported comment') : t('{count} reported comments', { count: reported })) : '',
    ].filter(Boolean);
    moderation = held == null && reported == null ? t('Ratings on hold and reported comments') : parts.length ? parts.join(' · ') : t('Nothing to check');
  }

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('Me')} · Sellio`;
    return () => { document.title = previous; };
  }, [textKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    setSigningOut(true);
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut({ scope: 'local' }); // this device only
    } catch { /* signed out locally below */ }
    clearAppUser?.();
    window.location.replace('/explore'); // no Back into the signed-in page
  };

  const name = appUser?.full_name || appUser?.email?.split('@')[0] || t('Sellio user');
  const contact = appUser?.email && !/@sellio\.app$/i.test(appUser.email) ? appUser.email : appUser?.phone || '';
  const storeUrl = hasShop && tenant?.slug ? `https://sellio.sg/store/${tenant.slug}` : null;
  // The onboarding tour's last stop (Settings) is here.
  const tourProgress = user?.tour_progress || {};
  const settingsPulse = hasShop && isOwner && !user?.has_seen_tour && !!tourProgress.dashboard && !tourProgress.settings;

  const copyLink = () => {
    if (!storeUrl) return;
    navigator.clipboard?.writeText(storeUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  // Their photo (Google's, or one they chose) in place of the letter. Without a shop there's no
  // profile window, so a tap on it here changes it; with one, the profile window does.
  const photoEmail = appUser?.email || user?.email;
  const initial = name.trim().charAt(0).toUpperCase();
  const avatar = hasShop ? (
    <ProfileAvatar email={photoEmail} initial={initial} size={56} fallbackClassName="text-white text-xl font-bold" fallbackStyle={{ background: BRAND_GRADIENT }} />
  ) : (
    <ProfilePhotoEditor email={photoEmail} initial={initial} size={56} fallbackStyle={{ background: BRAND_GRADIENT }} />
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <ExploreTabHeader title={t('Me')} right={<><AppLanguageSwitch /><ShopBell /></>} />
      <main className="max-w-xl mx-auto px-4 pt-4" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {appUser ? (
          <>
            {hasShop ? (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="w-full text-left bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 hover:bg-slate-50"
              >
                {avatar}
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-slate-900 truncate">{name}</span>
                  {contact && <span className="block text-sm text-slate-500 truncate">{contact}</span>}
                  <span className="block text-xs font-semibold mt-0.5" style={{ color: 'rgb(var(--color-primary, 59 130 246))' }}>{t('Profile, password and account')}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            ) : (
              <section className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
                {avatar}
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-900 truncate">{name}</p>
                  {contact && <p className="text-sm text-slate-500 truncate">{contact}</p>}
                </div>
              </section>
            )}

            {storeUrl && (
              <section className="mt-4 rounded-2xl p-4 text-white" style={{ background: BRAND_GRADIENT }}>
                <p className="text-sm font-semibold flex items-center gap-1.5"><Store className="w-4 h-4" /> {tenant?.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm text-white/90">{storeUrl.replace('https://', '')}</span>
                  <button type="button" onClick={copyLink} aria-label={t('Copy your shop link')} className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </section>
            )}

            {showRefer && (
              <Link
                to="/refer"
                className="mt-4 bg-white rounded-2xl border border-purple-200 px-4 py-3.5 flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100"
                data-testid="refer-row"
              >
                <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: BRAND_GRADIENT }}>
                  <Gift className="w-[22px] h-[22px] text-white" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-slate-900">{t('Refer & earn')}</span>
                    {referralNew && <span className="h-[22px] px-2 rounded-full bg-purple-50 text-purple-700 text-[11px] font-bold inline-flex items-center">{t('NEW')}</span>}
                  </span>
                  <span className="block text-xs text-slate-500">{referLine}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </Link>
            )}

            <section className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <Row to="/explore/purchases" icon={ShoppingBag} label={t('My purchases')} detail={purchasesLine || t('Orders you’ve placed and where they’re at')} />
              <div className="border-t border-slate-100">
                <Row to="/explore/likes" icon={Heart} label={t('My likes')} detail={t('Listings you’ve liked')} />
              </div>
              {moderation && (
                <div className="border-t border-slate-100">
                  <Row to="/moderation" icon={Flag} label={t('Ratings to check')} detail={moderation} />
                </div>
              )}
              {feedbackLine && (
                <div className="border-t border-slate-100">
                  <Row to="/admin/feedback" icon={MessageSquareHeart} label={t('App feedback')} detail={feedbackLine} pulse={appFeedback.lowOpen > 0} />
                </div>
              )}
              {sellioAdmin && (
                <div className="border-t border-slate-100">
                  <Row to="/admin/coins" icon={Coins} label={t('Sellio Coins')} detail={t('Coin prices, the daily limit and referral coins')} />
                </div>
              )}
            </section>

            <section className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
              {hasShop ? (
                <>
                  <Row to="/Dashboard" icon={LayoutDashboard} label={t('My shop')} detail={tenant ? t('Dashboard, orders and {products}', { products: itemWords(tenant.seller_type, t).products }) : t('Dashboard and orders')} />
                  {canSeeRatings && <Row to="/Ratings" icon={Star} label={t('Ratings')} detail={ratingLine || t('What buyers think of your shop')} />}
                  {hasPermission('settings.view') && (
                    <Row to="/TenantSettings" icon={Settings} label={t('Settings')} detail={t('Shop details, payments, selling, theme')} pulse={settingsPulse} />
                  )}
                  {tenant?.slug && <Row to={`/store/${encodeURIComponent(tenant.slug)}`} icon={Store} label={t('Your shop page')} detail={t('See your shop as buyers do')} />}
                </>
              ) : (
                <>
                  <Row to="/join" icon={Store} label={t('Start selling')} detail={t('Open a free shop')} />
                  <Row to="/Account" icon={UserRound} label={t('Account')} />
                </>
              )}
            </section>
          </>
        ) : (
          <section className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
            <img src={LOGO_URL} alt="Sellio" className="h-12 w-auto mx-auto object-contain" />
            <p className="mt-3 text-base font-bold text-slate-900">{t('Buy and sell on Sellio')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('Log in to chat with sellers and keep track of your listings.')}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link to="/Auth" onClick={() => rememberReturnPath('/explore/me')} className="h-10 px-5 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center">{t('Log in')}</Link>
              <Link to="/join" onClick={() => rememberReturnPath('/explore/me')} className="h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>{t('Sign up')}</Link>
            </div>
          </section>
        )}

        {appUser && (
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-4 w-full h-12 rounded-2xl bg-white border border-slate-100 text-[15px] font-semibold text-rose-600 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}{' '}{t('Sign out')}
          </button>
        )}
        {appUser && (
          <p className="mt-2 text-center">
            <Link to="/delete-account" className="inline-block py-2 text-xs text-slate-400 underline underline-offset-2 hover:text-rose-600">{t('Delete account')}</Link>
          </p>
        )}

        {/* Opened inside the app (no reload); "Back to Sellio" there returns here. */}
        <p className="mt-5 text-center text-xs text-slate-500">
          <Link to="/privacy" className="inline-block py-2 underline underline-offset-2 hover:text-slate-700">{t('Privacy')}</Link>
          <span aria-hidden="true" className="mx-2">·</span>
          <Link to="/terms" className="inline-block py-2 underline underline-offset-2 hover:text-slate-700">{t('Terms')}</Link>
        </p>
      </main>
      <ExploreTabBar active="me" />

      {hasShop && (
        <>
          <AccountProfileModal
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            user={appUser || user}
            subscription={subscription}
            onOpenPricing={() => setPlansOpen(true)}
            clearAppUser={clearAppUser}
          />
          <PricingModal open={plansOpen} onOpenChange={setPlansOpen} tenantId={tenant?.id} currentTier={subscription?.tier ?? null} />
        </>
      )}
    </div>
  );
}
