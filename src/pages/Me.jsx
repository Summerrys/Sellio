import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Store, Compass, ShieldCheck, FileText, LogOut, ChevronRight, Loader2, Copy, Check } from 'lucide-react';
import { useTenant } from '@/components/tenant/TenantContext';
import { useAppUser } from '@/lib/AppUserContext';
import { getSupabase } from '@/lib/supabaseClient';
import AccountProfileModal from '@/components/profile/AccountProfileModal';

// A free shop's Me tab: the account, the shop's page, Settings, and signing out.

const BRAND_GRADIENT = 'var(--color-primary-gradient)';

function Row({ to, href, icon: Icon, label, detail, pulse = false }) {
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
  return <Link to={to} className={className}>{inner}</Link>;
}

export default function Me() {
  const { user, tenant, hasPermission, isOwner, subscription } = useTenant();
  const { appUser, clearAppUser } = useAppUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const person = appUser || user;

  useEffect(() => {
    const previous = document.title;
    document.title = 'Me · Sellio';
    return () => { document.title = previous; };
  }, []);

  const name = person?.full_name || person?.email?.split('@')[0] || 'Sellio user';
  const contact = person?.email && !/@sellio\.app$/i.test(person.email) ? person.email : person?.phone || '';
  const storeUrl = tenant?.slug ? `https://sellio.apptelier.sg/store/${tenant.slug}` : null;
  // The onboarding tour's last stop (Settings) lives here now.
  const tourProgress = user?.tour_progress || {};
  const settingsPulse = isOwner && !user?.has_seen_tour && !!tourProgress.dashboard && !tourProgress.settings;

  const copyLink = () => {
    if (!storeUrl) return;
    navigator.clipboard?.writeText(storeUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
    } catch { /* signed out locally below */ }
    clearAppUser?.();
    window.location.href = '/Auth';
  };

  return (
    <div className="max-w-xl mx-auto px-2 sm:px-0">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Me</h1>
      <button
        type="button"
        onClick={() => setProfileOpen(true)}
        className="w-full text-left bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 hover:bg-slate-50"
      >
        <span className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{ background: BRAND_GRADIENT }}>
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-slate-900 truncate">{name}</span>
          {contact && <span className="block text-sm text-slate-500 truncate">{contact}</span>}
          <span className="block text-xs font-semibold mt-0.5" style={{ color: 'rgb(var(--color-primary))' }}>Profile, password and account</span>
        </span>
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </button>

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
        {hasPermission('settings.view') && (
          <Row to="/TenantSettings" icon={Settings} label="Settings" detail="Shop details, payments, selling, theme" pulse={settingsPulse} />
        )}
        {tenant?.slug && <Row to={`/store/${encodeURIComponent(tenant.slug)}`} icon={Store} label="Your shop page" detail="See your shop as buyers do" />}
        <Row to="/explore" icon={Compass} label="Explore" detail="Browse what other sellers list" />
      </section>

      <section className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
        <Row href="/privacy" icon={ShieldCheck} label="Privacy" />
        <Row href="/terms" icon={FileText} label="Terms" />
      </section>

      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="mt-4 w-full h-12 rounded-2xl bg-white border border-slate-100 text-[15px] font-semibold text-rose-600 inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Sign out
      </button>

      <AccountProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={person}
        subscription={subscription}
        clearAppUser={clearAppUser}
      />
    </div>
  );
}
