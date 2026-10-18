import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, LayoutDashboard, Settings, UserRound, ShieldCheck, FileText, LogOut, ChevronRight, Loader2, Copy, Check, Star } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { useTenant } from '@/components/tenant/TenantContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { ratingText, shopRatingOverview } from '@/lib/ratings';
import AccountProfileModal from '@/components/profile/AccountProfileModal';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import ShopBell from './ShopBell';
import { BRAND_GRADIENT, ExploreTabHeader, LOGO_URL } from './shared';

// Me — the one Me tab for everyone (a free shop's bar opens this same page): the account,
// the shop (its link, the Dashboard, Settings) and signing in or out.

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
  const { appUser, clearAppUser } = useAppUser() || {};
  const { user, tenant, hasPermission, isOwner, subscription } = useTenant();
  const [signingOut, setSigningOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasShop = !!appUser?.tenant_id;
  // The shop's ratings (its staff who see orders): "4.8 from 12 buyers".
  const canSeeRatings = hasShop && !!tenant?.id && hasPermission('orders.view');
  const [ratingLine, setRatingLine] = useState(null);
  useEffect(() => {
    if (!canSeeRatings) return undefined;
    let cancelled = false;
    shopRatingOverview(tenant.id).then((o) => {
      if (cancelled) return;
      const count = Number(o?.rating_count) || 0;
      setRatingLine(count ? `${ratingText(o.rating)} from ${count} ${count === 1 ? 'buyer' : 'buyers'}${o.last_7_days ? ` · ${o.last_7_days} this week` : ''}` : 'No ratings yet');
    }).catch(() => { if (!cancelled) setRatingLine('See what buyers think'); });
    return () => { cancelled = true; };
  }, [canSeeRatings, tenant?.id]);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Me · Sellio';
    return () => { document.title = previous; };
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
    } catch { /* signed out locally below */ }
    clearAppUser?.();
    window.location.href = '/explore';
  };

  const name = appUser?.full_name || appUser?.email?.split('@')[0] || 'Sellio user';
  const contact = appUser?.email && !/@sellio\.app$/i.test(appUser.email) ? appUser.email : appUser?.phone || '';
  const storeUrl = hasShop && tenant?.slug ? `https://sellio.apptelier.sg/store/${tenant.slug}` : null;
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

  const avatar = (
    <span className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{ background: BRAND_GRADIENT }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <ExploreTabHeader title="Me" right={<ShopBell />} />
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
                  <span className="block text-xs font-semibold mt-0.5" style={{ color: 'rgb(var(--color-primary, 59 130 246))' }}>Profile, password and account</span>
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
                  <button type="button" onClick={copyLink} aria-label="Copy your shop link" className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </section>
            )}

            <section className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
              {hasShop ? (
                <>
                  <Row to="/Dashboard" icon={LayoutDashboard} label="My shop" detail="Dashboard, orders and listings" />
                  {canSeeRatings && <Row to="/Ratings" icon={Star} label="Ratings" detail={ratingLine || 'What buyers think of your shop'} />}
                  {hasPermission('settings.view') && (
                    <Row to="/TenantSettings" icon={Settings} label="Settings" detail="Shop details, payments, selling, theme" pulse={settingsPulse} />
                  )}
                  {tenant?.slug && <Row to={`/store/${encodeURIComponent(tenant.slug)}`} icon={Store} label="Your shop page" detail="See your shop as buyers do" />}
                </>
              ) : (
                <>
                  <Row to="/join" icon={Store} label="Start selling" detail="Open a free shop" />
                  <Row to="/Account" icon={UserRound} label="Account" />
                </>
              )}
            </section>
          </>
        ) : (
          <section className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
            <img src={LOGO_URL} alt="Sellio" className="h-12 w-auto mx-auto object-contain" />
            <p className="mt-3 text-base font-bold text-slate-900">Buy and sell on Sellio</p>
            <p className="mt-1 text-sm text-slate-500">Log in to chat with sellers and keep track of your listings.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link to="/Auth" onClick={() => rememberReturnPath('/explore/me')} className="h-10 px-5 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center">Log in</Link>
              <Link to="/join" onClick={() => rememberReturnPath('/explore/me')} className="h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>Sign up</Link>
            </div>
          </section>
        )}

        <section className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
          <Row href="/privacy" icon={ShieldCheck} label="Privacy" />
          <Row href="/terms" icon={FileText} label="Terms" />
        </section>

        {appUser && (
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-4 w-full h-12 rounded-2xl bg-white border border-slate-100 text-[15px] font-semibold text-rose-600 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Sign out
          </button>
        )}
      </main>
      <ExploreTabBar active="me" />

      {hasShop && (
        <AccountProfileModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          user={appUser || user}
          subscription={subscription}
          clearAppUser={clearAppUser}
        />
      )}
    </div>
  );
}
