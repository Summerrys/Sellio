import React from 'react';
import { BUSINESS_PLANS } from '@/lib/plans';
import { PLANS_ON_WEBSITE } from '@/lib/nativeApp';

// What Sellio's apps show where the website sells plans (sellsPlans in src/lib/nativeApp.js):
// the current plan, if there is one, and that plans are managed on the website. No prices,
// no buttons and no link: Google Play and Apple require their own billing for subscriptions
// sold in an app.
export function planName(tier) {
  return BUSINESS_PLANS.find((plan) => plan.key === tier)?.name || '';
}

export default function PlansOnWebsite({ tier = null, note = '', className = '' }) {
  const name = planName(tier);
  return (
    <div className={`space-y-2 text-sm text-slate-600 ${className}`} data-testid="plans-on-website">
      {name && <p>Your plan: <span className="font-semibold text-slate-800">{name}</span></p>}
      {note && <p>{note}</p>}
      <p>{PLANS_ON_WEBSITE}</p>
    </div>
  );
}
