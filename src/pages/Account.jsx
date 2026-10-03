import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Store, Briefcase, Compass, ArrowRight, AlertCircle, Sparkles, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { completeAuthNavigation } from '@/lib/authNavigation';
import AppLoader from '@/components/ui-custom/AppLoader';
import AuthPricingModal from '@/components/auth/AuthPricingModal';
import { accountErrorMessage, nextStepFor } from '@/lib/accountFlow';

const LOGO_URL = 'https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png';
const BUTTON_STYLE = { background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' };
const SUPPORT_EMAIL = 'sellio@apptelier.sg';

function Card({ icon: Icon, iconClass, title, badge, children, highlight }) {
  return (
    <section className={`bg-white rounded-2xl p-5 shadow-sm border ${highlight ? 'border-orange-300 ring-2 ring-orange-100' : 'border-slate-100'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {badge && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{badge}</span>}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

// The account home for someone without a store yet: open a free personal shop,
// choose a business plan, or (later) explore and buy.
export default function Account() {
  const { setAppUser, clearAppUser } = useAppUser();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [showPlans, setShowPlans] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);
  const [shopName, setShopName] = useState('');
  const [sellsFood, setSellsFood] = useState(true);
  const [creating, setCreating] = useState(false);
  const [paymentEmail, setPaymentEmail] = useState('');
  const [waitingForPlan, setWaitingForPlan] = useState(false);
  const [planNotYet, setPlanNotYet] = useState(false);
  const token = useRef(new URLSearchParams(window.location.search).get('token')).current;

  const rememberProfile = async (supabase, email) => {
    const { data: rows } = await supabase
      .from('app_users')
      .select('id, email, full_name, role, onboarding_completed, tenant_id, phone')
      .eq('email', email)
      .limit(1);
    if (rows?.[0]) setAppUser(rows[0]);
  };

  const load = useCallback(async () => {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { window.location.replace('/Join'); return null; }
    const { data, error } = await supabase.rpc('my_account_status');
    if (error) {
      if (error.hint === 'not_signed_in') { window.location.replace('/Join'); return null; }
      throw error;
    }
    const next = nextStepFor(data);
    if (next === 'dashboard') {
      await rememberProfile(supabase, data.email);
      completeAuthNavigation('/Dashboard');
      return null;
    }
    if (next === 'finish' || next === 'staff') {
      window.location.replace('/Join');
      return null;
    }
    setStatus(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await load();
        if (!first || cancelled || !token) return;
        // Back from a Stripe checkout (/Auth?token=… while signed in): make sure the
        // payment belongs to this account, then wait for its plan to arrive.
        const supabase = await getSupabase();
        const paidWithOtherEmail = async (accountEmail) => {
          const { data: invite } = await supabase.rpc('get_invite_by_token', { p_token: token }).maybeSingle();
          if (invite?.email && invite.email.toLowerCase() !== accountEmail) {
            setPaymentEmail(invite.email);
            return true;
          }
          return false;
        };
        if (await paidWithOtherEmail(first.email) || first.business_invite) return;
        setWaitingForPlan(true);
        let latest = first;
        for (let i = 0; i < 8 && !cancelled; i++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          latest = await load();
          if (!latest || latest.business_invite) break;
          if (await paidWithOtherEmail(latest.email)) { latest = null; break; }
        }
        if (!cancelled) {
          setWaitingForPlan(false);
          if (latest && !latest.business_invite) setPlanNotYet(true);
        }
      } catch (err) {
        if (!cancelled) setLoadError(accountErrorMessage(err));
      }
    })();
    return () => { cancelled = true; };
  }, [load, token]);

  const signOut = async (next = '/Auth') => {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    clearAppUser();
    window.location.href = next;
  };

  const openFreeShop = async (e) => {
    e.preventDefault();
    const name = shopName.trim();
    if (name.length < 2) { toast.error('Please give your shop a name.'); return; }
    setCreating(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.rpc('create_personal_store', { p_name: name, p_sells_food: sellsFood });
      if (error) throw error;
      await rememberProfile(supabase, status.email);
      // Full reload so the workspace loads the new shop from scratch (as after onboarding),
      // straight into the shop's setup steps (step 15).
      window.location.href = '/ShopSetup';
    } catch (err) {
      toast.error(accountErrorMessage(err));
      setCreating(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-slate-50">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-slate-700 mb-4">{loadError}</p>
          <button type="button" onClick={() => window.location.reload()}
            className="w-full py-2.5 rounded-xl text-white text-sm font-semibold" style={BUTTON_STYLE}>Try again</button>
        </div>
      </div>
    );
  }
  if (!status) return <AppLoader visible={true} />;

  const firstName = (status.profile?.full_name || '').split(' ')[0];
  const businessReady = !!status.business_invite;

  return (
    <div className="min-h-[100dvh] w-full" style={{ background: 'radial-gradient(ellipse at top left, #faeee6 0%, #fdf6f2 30%, #ffffff 60%, #fdf4f0 100%)' }}>
      <header className="max-w-2xl mx-auto px-4 pt-5 flex items-center justify-between gap-3">
        <a href="/" aria-label="Sellio home"><img src={LOGO_URL} alt="Sellio" className="h-12 w-auto object-contain" /></a>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-slate-500 truncate hidden sm:inline">{status.email}</span>
          <button type="button" onClick={() => signOut()} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-white/70">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-slate-900">{firstName ? `Hi ${firstName}!` : 'Welcome!'}</h1>
          <p className="text-sm text-slate-500 mt-1">What would you like to do on Sellio?</p>
        </div>

        {paymentEmail && (
          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-2xl" role="alert">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p>This payment was made with <span className="font-semibold break-all">{paymentEmail}</span>, but you’re signed in as <span className="font-semibold break-all">{status.email}</span>.</p>
              <button type="button" onClick={() => signOut(`/Auth?token=${encodeURIComponent(token)}`)}
                className="mt-2 text-sm font-semibold text-orange-600 underline underline-offset-2">Sign out and continue with {paymentEmail}</button>
            </div>
          </div>
        )}

        {waitingForPlan && !businessReady && (
          <div className="flex items-center gap-2 p-4 bg-white border border-slate-100 rounded-2xl text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" /> Confirming your payment…
          </div>
        )}

        {planNotYet && !businessReady && !paymentEmail && (
          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-900" role="alert">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p>We haven’t received your payment confirmation yet. Please refresh this page in a minute, or email {SUPPORT_EMAIL} if it doesn’t appear.</p>
          </div>
        )}

        {businessReady && (
          <Card icon={Sparkles} iconClass="bg-orange-50 text-orange-500" title="Your business plan is ready" highlight>
            <p className="text-sm text-slate-500 mt-1">Set up your business: name, menu, opening hours and tables.</p>
            <button type="button" onClick={() => completeAuthNavigation('/Onboarding')}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold" style={BUTTON_STYLE}>
              Set up my business <ArrowRight className="w-4 h-4" />
            </button>
          </Card>
        )}

        {!businessReady && (
          <Card icon={Store} iconClass="bg-green-50 text-green-600" title="Sell from home" badge="Free">
            <p className="text-sm text-slate-500 mt-1">Your own shop page to share. Up to 10 listings and 100 orders a month. No card needed.</p>
            {!freeOpen ? (
              <button type="button" onClick={() => (status.setup_done ? setFreeOpen(true) : window.location.assign('/Join'))}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold" style={BUTTON_STYLE}>
                Open my free shop <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <form onSubmit={openFreeShop} className="mt-4 space-y-3" noValidate>
                <div>
                  <label htmlFor="shop-name" className="block text-sm font-medium text-slate-700 mb-1">Shop name</label>
                  <input id="shop-name" type="text" maxLength={60} placeholder="e.g. Jane’s Home Bakes" value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
                </div>
                <fieldset>
                  <legend className="block text-sm font-medium text-slate-700 mb-1">What will you sell?</legend>
                  <div className="flex gap-2">
                    {[{ value: true, label: 'Food & drinks' }, { value: false, label: 'Other things' }].map((option) => (
                      <label key={option.label}
                        className={`flex-1 text-center cursor-pointer px-3 py-2 rounded-xl border text-sm font-medium ${sellsFood === option.value ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600'}`}>
                        <input type="radio" name="sells" className="sr-only" checked={sellsFood === option.value} onChange={() => setSellsFood(option.value)} />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="flex gap-2">
                  <button type="submit" disabled={creating}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-70" style={BUTTON_STYLE}>
                    {creating ? 'Opening your shop…' : 'Open my shop'}
                  </button>
                  <button type="button" onClick={() => setFreeOpen(false)} disabled={creating}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white">Cancel</button>
                </div>
              </form>
            )}
          </Card>
        )}

        {!businessReady && (
          <Card icon={Briefcase} iconClass="bg-purple-50 text-purple-600" title="Run my business" badge="Paid plans">
            <p className="text-sm text-slate-500 mt-1">The counter, kitchen display, tables & QR ordering, staff logins, inventory and reports. Starts with a 7-day free trial.</p>
            <button type="button" onClick={() => setShowPlans(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50">
              See plans <ArrowRight className="w-4 h-4" />
            </button>
          </Card>
        )}

        <Card icon={Compass} iconClass="bg-slate-100 text-slate-400" title="Explore and buy" badge="Coming soon">
          <p className="text-sm text-slate-400 mt-1">Discover local shops and order from them, all in one place.</p>
        </Card>

        <p className="text-center text-xs text-slate-400 pt-2">
          Need help? <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-slate-500 underline underline-offset-2">{SUPPORT_EMAIL}</a>
        </p>
      </main>

      {showPlans && <AuthPricingModal onClose={() => setShowPlans(false)} prefilledEmail={status.email} />}
    </div>
  );
}
