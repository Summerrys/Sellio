import React from 'react';
import { BUSINESS_PLANS } from '@/lib/plans';
import { NO_PLANS_IN_APP } from '@/lib/nativeApp';

// What Sellio's apps show where the website sells plans (sellsPlans in src/lib/nativeApp.js):
// the current plan, if there is one, and that plans can't be bought in the app. No prices, no
// buttons, no link and no word of where plans are sold: Google Play and Apple require their
// own billing for subscriptions sold in an app and forbid sending people elsewhere to buy.
// (The file keeps its earlier name; until 5 Nov 2026 it said plans are managed on the website.)
export function planName(tier) {
  return BUSINESS_PLANS.find((plan) => plan.key === tier)?.name || '';
}

export default function PlansOnWebsite({ tier = null, note = '', className = '' }) {
  const name = planName(tier);
  return (
    <div className={`space-y-2 text-sm text-slate-600 ${className}`} data-testid="plans-on-website">
      {name && <p>Your plan: <span className="font-semibold text-slate-800">{name}</span></p>}
      {note && <p>{note}</p>}
      <p>{NO_PLANS_IN_APP}.</p>
    </div>
  );
}
