import React, { useContext, useEffect, useId, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, CircleCheck, Loader2, X } from 'lucide-react';
import TenantContext from '@/components/tenant/TenantContext';
import { BUSINESS_PLANS, INDONESIA_PAYMENT_NOTE, RUPIAH_NOTE, approxRupiah, plansFor, rupiahAmount, shopCheckoutLink } from '@/lib/plans';
import { formatMoney } from '@/lib/money';
import { usePlanRegion } from '@/lib/usePlanRegion';
import { itemWords } from '@/lib/planFeatures';
import BottomSheet from '@/components/explore/BottomSheet';
import PlanFootnotes from './PlanFootnotes';
import PlansOnWebsite from './PlansOnWebsite';
import { sellsPlans, openOutside, openOutsideSoon } from '@/lib/nativeApp';
import { useAppText, N_ } from '@/lib/appText';
import {
  attachReferral, forgetReferral, keepReferral, keptReferral, referralCode, referralCodeInfo, referralErrorMessage,
} from '@/lib/referral';

// The plan window, short (Alvin, 10 Nov 2026: "Redesign the modal with less words. Keep it short
// and sweet"): one list of plans and one button. Each row says what's compared first (listings or
// products, orders, price); what every plan adds is one line under them, and Compare plans opens
// the full list (lib/plans.js). A panel that rises from the bottom (BottomSheet: Back, Escape or a
// tap outside close it).
//
// The plans for a shop that exists already, from inside it (shopCheckoutLink: Stripe's page then
// says to go back to Sellio). A business shop gets them without a free trial: every business shop
// has had its trial (complete-onboarding sets tenants.has_used_trial when it creates the shop).
// Before 5 Nov 2026 this followed a hasUsedTrial prop, which one caller left out (Settings) and
// onboarding set to false, so those offered a second trial.
// A free home shop (Alvin, 9 Nov 2026): Upgrade to Business, the business plans with the 7-day
// free trial if the shop hasn't had one; paying makes it a business shop in place
// (sync_stripe_billing_state), and it goes back to a free home shop if it stops paying.
// An Indonesian shop (12 Nov 2026) gets Indonesia's prices and links (lib/plans.js), with about
// what they come to in rupiah.
// Refer & earn (20 Nov 2026): a shop's first business plan (a free home shop's, or a business
// shop's still on its free trial) can name the distributor who brought it, with their code: the
// owner types it, or it's there already from the distributor's link (lib/referral.js). Sellio
// records it (referral_attach) before Stripe's page opens; the shop's links still carry the
// shop's id.

const PLAN_RANK = { starter: 0, growth: 1, pro: 2 };
const LIMITS = {
  starter: N_('10 {products} · 100 orders a month'),
  growth: N_('50 {products} · 1,000 orders a month'),
  pro: N_('Unlimited {products} and orders'),
};
const EVERY_PLAN = N_('Every plan: counter, kitchen display, tables & QR, staff logins and printing.');
const BRAND = 'linear-gradient(135deg, #fb923c, #e0449a 55%, #8b2fc9)';
const PICKED = '#8b2fc9';
const money = (amount) => `S$${Number(amount).toLocaleString('en-SG')}`;

// The plan picked first: Growth, or for a business on a plan the next one up.
function firstPick(currentTier, personal) {
  if (personal || !currentTier) return 'growth';
  if (currentTier === 'starter') return 'growth';
  return 'pro';
}

// The code field: empty, or a code Sellio knows (info from referral_code_info).
function ReferralCodeField({ t, info, onApply, onRemove, error, setError }) {
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);
  const inputId = useId();

  const apply = async () => {
    const code = referralCode(typed);
    if (!code) { setError(t("That referral code isn't valid.")); return; }
    setChecking(true);
    setError('');
    try {
      const answer = await referralCodeInfo(code);
      if (answer?.found) { onApply(answer); setTyped(''); } else setError(t("That referral code isn't valid."));
    } catch {
      setError(t('Couldn’t check that code. Check your connection and try again.'));
    } finally {
      setChecking(false);
    }
  };

  const who = info && (info.firstName && info.shopName
    ? t('{name} from {shop}', { name: info.firstName, shop: info.shopName })
    : info.shopName || info.firstName);
  return (
    <div className="mt-3 flex flex-col gap-1.5" data-testid="plan-referral">
      <label htmlFor={inputId} className="text-[13px] font-semibold text-slate-700">{t('Referral code (optional)')}</label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={info ? info.code : typed}
          readOnly={!!info}
          onChange={(e) => { setTyped(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!info) apply(); } }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          className="h-11 flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold uppercase tracking-[0.08em] text-slate-900 read-only:bg-slate-50"
          data-testid="plan-referral-input"
        />
        {info ? (
          <button type="button" onClick={onRemove} className="h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700">{t('Remove')}</button>
        ) : (
          <button type="button" onClick={apply} disabled={checking || !typed.trim()} className="h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:text-slate-400 inline-flex items-center gap-1.5">
            {checking && <Loader2 className="w-4 h-4 animate-spin" />}{t('Apply')}
          </button>
        )}
      </div>
      {info && (
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700" data-testid="plan-referral-who">
          <CircleCheck className="w-4 h-4 flex-shrink-0" />{who ? t('{who} referred you', { who }) : t('Referral code {code} applied', { code: info.code })}
        </p>
      )}
      {error && <p role="alert" className="text-[13px] text-rose-700" data-testid="plan-referral-error">{error}</p>}
    </div>
  );
}

export default function PricingModal({ open, onOpenChange, tenantId, currentTier = null }) {
  const { t } = useAppText();
  const [billing, setBilling] = useState('monthly');
  const tenantContext = useContext(TenantContext);
  const shop = tenantContext?.tenant;
  const isPersonalShop = shop?.seller_type === 'individual';
  const freeTrial = isPersonalShop && shop?.id === tenantId && !shop?.has_used_trial;
  const current = isPersonalShop ? null : currentTier;
  const words = itemWords(isPersonalShop ? 'individual' : 'merchant', t);
  const [picked, setPicked] = useState(() => firstPick(current, isPersonalShop));
  const [compare, setCompare] = useState(false);
  const titleId = useId();
  // Only the shop's owner pays for the shop: stripe-webhook attaches a payment only when its
  // email (or phone) is the owner's (5 Nov 2026). So Stripe's form starts with the owner's
  // email. A phone sign-in's placeholder address (…@sellio.app) isn't one.
  const ownerEmail = shop?.id === tenantId && typeof shop?.owner_email === 'string'
    && !/@sellio\.app$/i.test(shop.owner_email.trim()) ? shop.owner_email.trim() : '';
  const region = usePlanRegion(shop?.id === tenantId ? shop : null);
  const plans = plansFor(region);
  // Refer & earn: the owner names the distributor before the shop's first payment.
  const canAddCode = !!tenantContext?.isOwner && shop?.id === tenantId
    && (isPersonalShop || tenantContext?.subscription?.status === 'trial');
  const [referral, setReferral] = useState(null); // the code applied: referral_code_info's answer
  const [codeError, setCodeError] = useState('');
  const [attaching, setAttaching] = useState(false);

  // Opened again: the first pick, the full list closed, and the code from the distributor's link.
  useEffect(() => {
    if (!open) return;
    setPicked(firstPick(current, isPersonalShop));
    setCompare(false);
    setCodeError('');
    const kept = keptReferral();
    setReferral(kept ? { code: kept.code, shopName: kept.shopName, firstName: kept.firstName } : null);
  }, [open, current, isPersonalShop]);

  const close = () => onOpenChange?.(false);

  // Where Sellio sells no plans (sellsPlans): the plan, and that plans are managed on the website.
  if (!sellsPlans()) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-center">{t('Your plan')}</DialogTitle>
          </DialogHeader>
          <PlansOnWebsite
            tier={isPersonalShop ? null : currentTier}
            note={isPersonalShop ? t('Your personal shop is on the free plan: up to 10 listings and 100 orders a month.') : ''}
          />
        </DialogContent>
      </Dialog>
    );
  }

  const yearly = billing === 'annual';
  const plan = plans.find((p) => p.key === picked) || plans[0];
  const price = yearly ? plan.yearly : plan.monthly;
  const isCurrent = !!current && plan.key === current;
  let action = t('Choose {name}', { name: plan.name });
  if (isPersonalShop) action = freeTrial ? t('Start 7 days free') : t('Upgrade to {name}', { name: plan.name });
  else if (isCurrent) action = t('Your current plan');
  else if (current) action = (PLAN_RANK[plan.key] ?? 0) > (PLAN_RANK[current] ?? 0) ? t('Upgrade to {name}', { name: plan.name }) : t('Move to {name}', { name: plan.name });
  const rupiah = t(RUPIAH_NOTE, { amount: rupiahAmount(price) });
  const cost = region === 'ID'
    ? (yearly ? t('{price} a year, {rupiah}.', { price: money(price), rupiah }) : t('{price} a month, {rupiah}.', { price: money(price), rupiah }))
    : (yearly ? t('{price} a year.', { price: money(price) }) : t('{price} a month.', { price: money(price) }));
  const fine = isPersonalShop
    ? (freeTrial ? t('Then {cost} If you stop paying, it goes back to a free home shop.', { cost }) : t('{cost} If you stop paying, it goes back to a free home shop.', { cost }))
    : cost;

  const checkout = async () => {
    if (isCurrent || attaching) return;
    if (!canAddCode || !referral) {
      openOutside(shopCheckoutLink(plan.key, { yearly, trial: freeTrial, tenantId, email: ownerEmail, region }));
      return;
    }
    // A distributor's code: Sellio records it first, then Stripe's page opens (in the tab the tap
    // opened, openOutsideSoon). Refused, it says why and nothing opens.
    const outside = openOutsideSoon();
    setAttaching(true);
    setCodeError('');
    try {
      await attachReferral(tenantId, referral.code);
    } catch (error) {
      outside.cancel();
      setCodeError(referralErrorMessage(error, t));
      setAttaching(false);
      return;
    }
    setAttaching(false);
    outside.go(shopCheckoutLink(plan.key, { yearly, trial: freeTrial, tenantId, email: ownerEmail, region }));
  };

  const footer = (
    <>
      <button
        type="button"
        data-testid="plan-checkout"
        onClick={checkout}
        disabled={isCurrent || attaching}
        className="w-full h-12 rounded-[13px] text-[15px] font-extrabold text-white disabled:text-slate-400 inline-flex items-center justify-center gap-2"
        style={isCurrent ? { background: '#e2e8f0' } : { background: BRAND }}
      >
        {attaching && <Loader2 className="w-4 h-4 animate-spin text-white" />}{action}
      </button>
      <p data-testid="plan-fine-print" className="mt-2 text-center text-[11.5px] leading-snug text-slate-400">
        {fine}
      </p>
      {isPersonalShop
        ? region === 'ID' && <p data-testid="plan-payment-note" className="mt-1 text-center text-[11.5px] leading-snug text-slate-400">{INDONESIA_PAYMENT_NOTE}</p>
        : <PlanFootnotes region={region} />}
    </>
  );

  return (
    <BottomSheet open={open} onClose={close} labelledBy={titleId} footer={footer}>
      <div data-testid="plan-window" className="relative pt-1">
        <button
          type="button"
          onClick={close}
          aria-label={t('Close')}
          className="absolute right-0 top-0 w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 id={titleId} className="pr-10 text-xl font-extrabold tracking-tight text-slate-900">
          {isPersonalShop ? t('Upgrade to Business') : t('Choose your plan')}
        </h2>
        <p data-testid="home-shop-upgrade" className="mt-1 pr-6 text-[13px] leading-snug text-slate-500">
          {isPersonalShop
            ? (freeTrial ? t('7 days free. Your shop keeps its link, listings and orders.') : t('Your shop keeps its link, listings and orders.'))
            : current ? t("You're on {plan}.", { plan: BUSINESS_PLANS.find((p) => p.key === current)?.name || t('a plan') }) : t('Pick the plan that fits your shop.')}
        </p>

        <div role="radiogroup" aria-label={t('Billing')} className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-[3px]">
          {[['monthly', t('Monthly')], ['annual', t('Yearly')]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={billing === key}
              onClick={() => setBilling(key)}
              className={`h-9 rounded-[9px] text-[13px] font-bold ${billing === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {label}
              {key === 'annual' && <span className="ml-1 text-[11px] font-bold text-green-600">{t('2 months free')}</span>}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label={t('Plan')} className="mt-3 space-y-2">
          {plans.map((p) => {
            const on = p.key === picked;
            const thisCurrent = !!current && p.key === current;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={on}
                data-plan={p.key}
                onClick={() => setPicked(p.key)}
                className="w-full flex items-center gap-3 rounded-[14px] bg-white px-3 py-2.5 text-left"
                style={{ border: on ? `2px solid ${PICKED}` : '1.5px solid #e2e8f0', background: on ? '#faf5ff' : '#fff', padding: on ? '9.5px 11.5px' : undefined }}
              >
                <span
                  aria-hidden="true"
                  className="w-[18px] h-[18px] rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ border: `2px solid ${on ? PICKED : '#cbd5e1'}` }}
                >
                  {on && <span className="w-2 h-2 rounded-full" style={{ background: PICKED }} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[14px] font-bold text-slate-900">{p.name}</span>
                    {thisCurrent ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{t('Current')}</span>
                    ) : p.key === 'growth' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">{t('Popular')}</span>
                    )}
                  </span>
                  <span className="block text-[11.5px] leading-snug text-slate-500">{t(LIMITS[p.key], { products: words.products })}</span>
                </span>
                <span className="text-right flex-shrink-0">
                  <span className="text-[15px] font-extrabold text-slate-900">{money(yearly ? p.yearly : p.monthly)}</span>
                  <span className="text-[10.5px] font-semibold text-slate-400">{yearly ? t('/yr') : t('/mo')}</span>
                  {region === 'ID' && (
                    <span data-testid="plan-rupiah" className="block text-[10.5px] font-semibold text-slate-500">
                      ≈ {formatMoney(approxRupiah(yearly ? p.yearly : p.monthly), 'IDR')}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {canAddCode && (
          <ReferralCodeField
            t={t}
            info={referral}
            onApply={(answer) => { keepReferral({ ...answer, typed: true }); setReferral({ code: answer.code, shopName: answer.shopName, firstName: answer.firstName }); }}
            onRemove={() => { forgetReferral(); setReferral(null); setCodeError(''); }}
            error={codeError}
            setError={setCodeError}
          />
        )}

        <p className="mt-2 text-[11.5px] leading-snug text-slate-500">
          {t(EVERY_PLAN)}{' '}
          <button type="button" onClick={() => setCompare((on) => !on)} aria-expanded={compare} className="font-bold text-purple-700 underline-offset-2 hover:underline">
            {compare ? t('Hide the full list') : t('Compare plans')}
          </button>
        </p>
        {compare && (
          <div data-testid="plan-compare" className="mt-3 space-y-3">
            {plans.map((p) => (
              <div key={p.key}>
                <p className="text-[12.5px] font-bold text-slate-900">{p.name}</p>
                <ul className="mt-1 space-y-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[12px] text-slate-600">
                      <Check className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
