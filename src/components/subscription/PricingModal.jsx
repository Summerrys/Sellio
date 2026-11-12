import React, { useContext, useEffect, useId, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, X } from 'lucide-react';
import TenantContext from '@/components/tenant/TenantContext';
import { BUSINESS_PLANS, INDONESIA_PAYMENT_NOTE, approxRupiah, plansFor, rupiahNote, shopCheckoutLink } from '@/lib/plans';
import { formatMoney } from '@/lib/money';
import { usePlanRegion } from '@/lib/usePlanRegion';
import { itemWords } from '@/lib/planFeatures';
import BottomSheet from '@/components/explore/BottomSheet';
import PlanFootnotes from './PlanFootnotes';
import PlansOnWebsite from './PlansOnWebsite';
import { sellsPlans, openOutside } from '@/lib/nativeApp';

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

const PLAN_RANK = { starter: 0, growth: 1, pro: 2 };
const LIMITS = {
  starter: (words) => `10 ${words.products} · 100 orders a month`,
  growth: (words) => `50 ${words.products} · 1,000 orders a month`,
  pro: (words) => `Unlimited ${words.products} and orders`,
};
const EVERY_PLAN = 'Every plan: counter, kitchen display, tables & QR, staff logins and printing.';
const BRAND = 'linear-gradient(135deg, #fb923c, #e0449a 55%, #8b2fc9)';
const PICKED = '#8b2fc9';
const money = (amount) => `S$${Number(amount).toLocaleString('en-SG')}`;

// The plan picked first: Growth, or for a business on a plan the next one up.
function firstPick(currentTier, personal) {
  if (personal || !currentTier) return 'growth';
  if (currentTier === 'starter') return 'growth';
  return 'pro';
}

export default function PricingModal({ open, onOpenChange, tenantId, currentTier = null }) {
  const [billing, setBilling] = useState('monthly');
  const shop = useContext(TenantContext)?.tenant;
  const isPersonalShop = shop?.seller_type === 'individual';
  const freeTrial = isPersonalShop && shop?.id === tenantId && !shop?.has_used_trial;
  const current = isPersonalShop ? null : currentTier;
  const words = itemWords(isPersonalShop ? 'individual' : 'merchant');
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

  // Opened again: the first pick, the full list closed.
  useEffect(() => {
    if (!open) return;
    setPicked(firstPick(current, isPersonalShop));
    setCompare(false);
  }, [open, current, isPersonalShop]);

  const close = () => onOpenChange?.(false);

  // Where Sellio sells no plans (sellsPlans): the plan, and that plans are managed on the website.
  if (!sellsPlans()) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-center">Your plan</DialogTitle>
          </DialogHeader>
          <PlansOnWebsite
            tier={isPersonalShop ? null : currentTier}
            note={isPersonalShop ? 'Your personal shop is on the free plan: up to 10 listings and 100 orders a month.' : ''}
          />
        </DialogContent>
      </Dialog>
    );
  }

  const yearly = billing === 'annual';
  const plan = plans.find((p) => p.key === picked) || plans[0];
  const price = yearly ? plan.yearly : plan.monthly;
  const isCurrent = !!current && plan.key === current;
  let action = `Choose ${plan.name}`;
  if (isPersonalShop) action = freeTrial ? 'Start 7 days free' : `Upgrade to ${plan.name}`;
  else if (isCurrent) action = 'Your current plan';
  else if (current) action = (PLAN_RANK[plan.key] ?? 0) > (PLAN_RANK[current] ?? 0) ? `Upgrade to ${plan.name}` : `Move to ${plan.name}`;
  const cost = region === 'ID'
    ? `${money(price)} a ${yearly ? 'year' : 'month'}, ${rupiahNote(price)}.`
    : `${money(price)} a ${yearly ? 'year' : 'month'}.`;
  const fine = isPersonalShop
    ? `${freeTrial ? 'Then ' : ''}${cost} If you stop paying, it goes back to a free home shop.`
    : cost;

  const checkout = () => {
    if (isCurrent) return;
    openOutside(shopCheckoutLink(plan.key, { yearly, trial: freeTrial, tenantId, email: ownerEmail, region }));
  };

  const footer = (
    <>
      <button
        type="button"
        data-testid="plan-checkout"
        onClick={checkout}
        disabled={isCurrent}
        className="w-full h-12 rounded-[13px] text-[15px] font-extrabold text-white disabled:text-slate-400"
        style={isCurrent ? { background: '#e2e8f0' } : { background: BRAND }}
      >
        {action}
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
          aria-label="Close"
          className="absolute right-0 top-0 w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 id={titleId} className="pr-10 text-xl font-extrabold tracking-tight text-slate-900">
          {isPersonalShop ? 'Upgrade to Business' : 'Choose your plan'}
        </h2>
        <p data-testid="home-shop-upgrade" className="mt-1 pr-6 text-[13px] leading-snug text-slate-500">
          {isPersonalShop
            ? `${freeTrial ? '7 days free. ' : ''}Your shop keeps its link, listings and orders.`
            : current ? `You're on ${BUSINESS_PLANS.find((p) => p.key === current)?.name || 'a plan'}.` : 'Pick the plan that fits your shop.'}
        </p>

        <div role="radiogroup" aria-label="Billing" className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-[3px]">
          {[['monthly', 'Monthly'], ['annual', 'Yearly']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={billing === key}
              onClick={() => setBilling(key)}
              className={`h-9 rounded-[9px] text-[13px] font-bold ${billing === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {label}
              {key === 'annual' && <span className="ml-1 text-[11px] font-bold text-green-600">2 months free</span>}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Plan" className="mt-3 space-y-2">
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
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Current</span>
                    ) : p.key === 'growth' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">Popular</span>
                    )}
                  </span>
                  <span className="block text-[11.5px] leading-snug text-slate-500">{LIMITS[p.key](words)}</span>
                </span>
                <span className="text-right flex-shrink-0">
                  <span className="text-[15px] font-extrabold text-slate-900">{money(yearly ? p.yearly : p.monthly)}</span>
                  <span className="text-[10.5px] font-semibold text-slate-400">/{yearly ? 'yr' : 'mo'}</span>
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

        <p className="mt-2 text-[11.5px] leading-snug text-slate-500">
          {EVERY_PLAN}{' '}
          <button type="button" onClick={() => setCompare((on) => !on)} aria-expanded={compare} className="font-bold text-purple-700 underline-offset-2 hover:underline">
            {compare ? 'Hide the full list' : 'Compare plans'}
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
