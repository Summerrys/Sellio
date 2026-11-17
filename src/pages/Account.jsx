import React, { useCallback, useEffect, useRef, useState } from 'react';
import { House, Store, Compass, ArrowRight, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { sellsPlans, PLANS_ON_WEBSITE } from '@/lib/nativeApp';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { completeAuthNavigation } from '@/lib/authNavigation';
import AppLoader from '@/components/ui-custom/AppLoader';
import AuthPricingModal from '@/components/auth/AuthPricingModal';
import { accountErrorMessage, nextStepFor } from '@/lib/accountFlow';
import { useAppText } from '@/lib/appText';
import AppLanguageSwitch from '@/components/ui-custom/AppLanguageSwitch';
import SignUpSteps from '@/components/auth/SignUpSteps';
import ShopNameStall from '@/components/auth/ShopNameStall';
import { FieldError, FormError, fieldBorder, fieldProps } from '@/components/ui-custom/FieldError';
import { clearAccountWelcome, readAccountWelcome } from '@/lib/accountWelcome';

const BUTTON_STYLE = { background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' };
const SUPPORT_EMAIL = 'sellio@apptelier.sg';
const CONFETTI = ['#fb923c', '#e0449a', '#8b5cf6', '#fde047', '#34d399', '#f472b6'];

// One choice on the account page (Alvin, 17 Nov 2026): a big card, its icon in its colour, a
// sticker (Free, 7-day free trial), the whole card tappable when it leads somewhere. Styles:
// index.css (.account-choice).
function ChoiceCard({ tone, icon: Icon, title, tag, tagTone, onClick, to, delay = 0, children }) {
  const body = (
    <>
      {tag && <span className={`account-choice-tag ${tagTone}`}>{tag}</span>}
      <span className={`account-choice-icon ${tone}`}><Icon aria-hidden="true" /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold text-slate-800">{title}</span>
        <span className="block mt-0.5 text-[12.5px] leading-snug text-slate-500">{children}</span>
      </span>
      {(onClick || to) && <ArrowRight className="w-[18px] h-[18px] text-slate-400 flex-shrink-0" aria-hidden="true" />}
    </>
  );
  const className = `account-choice ${tone}`;
  const style = { animationDelay: `${delay}s` };
  if (to) return <Link to={to} className={className} style={style}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={className} style={style}>{body}</button>;
  return <div className={className} style={style}>{body}</div>;
}

// The account home for someone without a store yet: open a free personal shop,
// choose a business plan, or (later) explore and buy.
export default function Account() {
  const { t } = useAppText();
  const { setAppUser, clearAppUser } = useAppUser();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [showPlans, setShowPlans] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);
  const [shopName, setShopName] = useState('');
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState('');
  const [formError, setFormError] = useState('');
  // Right after "Set up your account": welcome, step 3 of 3, a little confetti (cleared once seen).
  const [welcome] = useState(() => readAccountWelcome());
  const [confetti, setConfetti] = useState(welcome); // once: not again after Name your shop → Back
  useEffect(() => { clearAccountWelcome(); }, []);
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
    await supabase.auth.signOut({ scope: 'local' }); // this device only
    clearAppUser();
    window.location.replace(next);
  };

  const openFreeShop = async (e) => {
    e.preventDefault();
    const name = shopName.trim();
    setFormError('');
    if (name.length < 2) {
      setNameError(t('Please give your shop a name.'));
      document.getElementById('shop-name')?.focus();
      return;
    }
    setCreating(true);
    try {
      const supabase = await getSupabase();
      // What a home seller sells isn't asked: a shop can sell anything (p_sells_food: null).
      const { error } = await supabase.rpc('create_personal_store', { p_name: name, p_sells_food: null });
      if (error) throw error;
      await rememberProfile(supabase, status.email);
      // Full reload so the workspace loads the new shop from scratch (as after onboarding),
      // straight into the shop's setup steps (step 15).
      window.location.replace('/ShopSetup'); // Back from setup doesn't return to "open a shop"
    } catch (err) {
      setFormError(accountErrorMessage(err));
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
            className="w-full py-2.5 rounded-xl text-white text-sm font-semibold" style={BUTTON_STYLE}>{t('Try again')}</button>
        </div>
      </div>
    );
  }
  if (!status) return <AppLoader visible={true} />;

  const firstName = (status.profile?.full_name || '').split(' ')[0];
  const businessReady = !!status.business_invite;

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at top left, #faeee6 0%, #fdf6f2 30%, #ffffff 60%, #fdf4f0 100%)' }}>
      <div className="w-full max-w-sm sm:max-w-md">
        {/* The sign-up's card (Alvin, 17 Nov 2026): the awning on its top edge; on the first visit
            step 3 of 3 and a little confetti. "Sell from home" opens "Name your shop" in it. */}
        <div className="relative bg-white rounded-2xl shadow-xl p-8 pt-0 overflow-hidden" data-testid="account-card">
          {confetti && !freeOpen && (
            <div className="sellio-confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} style={{ left: `${(i * 37 + 11) % 92 + 4}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i * 0.13) % 0.6}s`, transform: `rotate(${(i * 29) % 90}deg)` }} />
              ))}
            </div>
          )}
          <AppLanguageSwitch className="absolute right-3 top-1 z-10 join-stall-language" />

          {freeOpen ? (
            <form onSubmit={openFreeShop} noValidate data-testid="shop-name-form">
              <ShopNameStall name={shopName} />
              <div className="text-center mt-5">
                <h1 className="text-[22px] leading-tight font-extrabold tracking-tight text-slate-800">{t('Name your shop')}</h1>
                <p className="mt-1.5 text-sm text-slate-500">{t('It goes on your sign and your shop page.')}</p>
              </div>
              <label htmlFor="shop-name" className="block text-sm font-medium text-slate-700 mt-4 mb-1">{t('Shop name')}</label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <input id="shop-name" type="text" maxLength={60} placeholder={t('e.g. Jane’s Home Bakes')} value={shopName} autoComplete="organization"
                  onChange={(e) => { setShopName(e.target.value); setNameError(''); setFormError(''); }}
                  className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 ${fieldBorder(nameError)}`}
                  {...fieldProps('shop-name', nameError)} />
              </div>
              <FieldError id="shop-name-error">{nameError}</FieldError>
              {formError && <div className="mt-3"><FormError>{formError}</FormError></div>}
              <button type="submit" disabled={creating}
                className="mt-4 w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity disabled:opacity-70" style={BUTTON_STYLE}>
                <span className="inline-flex items-center justify-center gap-2">{creating ? t('Opening your shop…') : t('Open my shop')}{!creating && <ArrowRight className="w-4 h-4" aria-hidden="true" />}</span>
              </button>
              <button type="button" onClick={() => { setFreeOpen(false); setNameError(''); setFormError(''); }} disabled={creating}
                className="block mx-auto mt-3 px-4 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700">{t('Back')}</button>
            </form>
          ) : (
            <>
              <div className="join-stall-awning -mx-8" aria-hidden="true" />
              {welcome ? <SignUpSteps step={3} /> : <div className="h-6" />}
              <div className="text-center mb-2">
                <h1 className="text-[22px] leading-tight font-extrabold tracking-tight text-slate-800">
                  {!firstName ? t('Welcome!') : welcome
                    ? t('Hi {firstName}, welcome to {name}!', { firstName, name: <span className="join-stall-brand">Sellio</span> })
                    : t('Hi {firstName}!', { firstName })}
                </h1>
                <p className="mt-1.5 text-sm text-slate-500">{welcome ? t('What would you like to do first?') : t('What would you like to do on Sellio?')}</p>
              </div>

              {paymentEmail && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl" role="alert">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-900">
                    <p>{t('This payment was made with {paymentEmail}, but you’re signed in as {email}.', { paymentEmail: <span className="font-semibold break-all">{paymentEmail}</span>, email: <span className="font-semibold break-all">{status.email}</span> })}</p>
                    <button type="button" onClick={() => signOut(`/Auth?token=${encodeURIComponent(token)}`)}
                      className="mt-2 text-sm font-semibold text-orange-600 underline underline-offset-2">{t('Sign out and continue with {paymentEmail}', { paymentEmail })}</button>
                  </div>
                </div>
              )}

              {waitingForPlan && !businessReady && (
                <div className="mt-3 flex items-center gap-2 p-3 bg-white border border-slate-100 rounded-xl text-sm text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" />{' '}{t('Confirming your payment…')}
                </div>
              )}

              {planNotYet && !businessReady && !paymentEmail && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900" role="alert">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p>{t('We haven’t received your payment confirmation yet. Please refresh this page in a minute, or email {SUPPORT_EMAIL} if it doesn’t appear.', { SUPPORT_EMAIL })}</p>
                </div>
              )}

              {businessReady && (
                <ChoiceCard tone="ready" icon={Sparkles} title={t('Your business plan is ready')} onClick={() => completeAuthNavigation('/Onboarding')}>
                  {t('Set up your business: name, menu, opening hours and tables.')}
                </ChoiceCard>
              )}

              {!businessReady && (
                <ChoiceCard tone="home" icon={House} title={t('Sell from home')} tag={t('Free')} tagTone="free"
                  onClick={() => { setConfetti(false); if (status.setup_done) setFreeOpen(true); else window.location.assign('/Join'); }}>
                  {t('Your own shop page to share. Up to 10 listings and 100 orders a month. No card needed.')}
                </ChoiceCard>
              )}

              {/* In the apps (which sell no plans) the card stays, says where plans are, and leads
                  nowhere; plans open wherever they're sold. */}
              {!businessReady && (
                <ChoiceCard tone="biz" icon={Store} title={t('Run my business')}
                  tag={sellsPlans() ? t('7-day free trial') : t('Paid plans')} tagTone="trial" delay={0.1}
                  onClick={sellsPlans() ? () => setShowPlans(true) : undefined}>
                  {t('The counter, kitchen display, tables & QR ordering, staff logins, inventory and reports. Starts with a 7-day free trial.')}
                  {!sellsPlans() && <span className="block mt-1.5 font-medium text-slate-600">{PLANS_ON_WEBSITE}</span>}
                </ChoiceCard>
              )}

              <ChoiceCard tone="explore" icon={Compass} title={t('Explore and buy')} to="/explore" delay={0.2}>
                {t('Discover local shops and order from them, all in one place.')}
              </ChoiceCard>

              <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
                {t('Need help?')}{' '}<a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-slate-500 underline underline-offset-2">{SUPPORT_EMAIL}</a>
                <br />
                <button type="button" onClick={() => signOut()} className="font-medium text-slate-500 underline underline-offset-2">{t('Sign out')}</button>
                <span aria-hidden="true" className="mx-2">·</span>
                <Link to="/delete-account" className="font-medium text-slate-500 underline underline-offset-2">{t('Delete my account')}</Link>
              </p>
            </>
          )}
        </div>
      </div>

      {showPlans && <AuthPricingModal onClose={() => setShowPlans(false)} prefilledEmail={status.email} />}
    </div>
  );
}
