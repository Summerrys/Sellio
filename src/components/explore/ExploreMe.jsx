import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, LayoutGrid, MessageCircle, UserRound, ShieldCheck, FileText, LogOut, ChevronRight, Loader2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import { BRAND_GRADIENT, ExploreTabHeader, LOGO_URL } from './shared';

// Explore → Me: the account, the shop, and signing in or out.

function Row({ to, href, icon: Icon, label, detail, onClick }) {
  const inner = (
    <>
      <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-[18px] h-[18px] text-slate-600" />
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
  const [signingOut, setSigningOut] = useState(false);
  const hasShop = !!appUser?.tenant_id;

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

  return (
    <div className="min-h-screen bg-slate-50">
      <ExploreTabHeader title="Me" />
      <main className="max-w-xl mx-auto px-4 pt-4" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {appUser ? (
          <>
            <section className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
              <span className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{ background: BRAND_GRADIENT }}>
                {name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-900 truncate">{name}</p>
                {contact && <p className="text-sm text-slate-500 truncate">{contact}</p>}
              </div>
            </section>

            <section className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
              {hasShop
                ? <Row to="/Dashboard" icon={Store} label="My shop" detail="Orders, listings and settings" />
                : <Row to="/join" icon={Store} label="Start selling" detail="Open a free shop" />}
              <Row to="/explore/listings" icon={LayoutGrid} label="My listings" />
              <Row to="/explore/chats" icon={MessageCircle} label="Chats" />
              <Row to="/Account" icon={UserRound} label="Account" />
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
    </div>
  );
}
