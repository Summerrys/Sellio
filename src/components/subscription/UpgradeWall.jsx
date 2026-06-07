import React, { useState } from 'react';
import { Lock, Check } from 'lucide-react';
import { useTenant } from '../tenant/TenantContext';
import { getSupabase } from '@/lib/supabaseClient';

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 79,
    yearly: 790,
    description: 'Perfect for small businesses just getting started',
    color: 'blue',
    features: [
      '10 products',
      'Up to 100 orders/month',
      '3 staff accounts',
      '5 tables & QR codes',
      '1 branch',
      'Basic reports',
      'Custom theme',
      'In-app notifications',
      'Email support (72hr)',
    ],
    links: {
      monthly: 'https://buy.stripe.com/00wdRbdyV1kn8qfebK7bW02',
      yearly: 'https://buy.stripe.com/fZu5kF1Qd8MP0XN3x67bW03',
    },
  },
  {
    key: 'growth',
    name: 'Growth',
    monthly: 139,
    yearly: 1390,
    description: 'For growing businesses with higher demands',
    color: 'purple',
    badge: 'Most Popular',
    features: [
      '50 products',
      'Up to 1,000 orders/month',
      '5 staff accounts',
      '5 tables & QR codes',
      'Up to 3 branches',
      'Advanced reports',
      'Custom theme',
      'In-app & email notifications',
      'Email + Chat support (24hr)',
      'Custom editable roles (up to 5)',
    ],
    links: {
      monthly: 'https://buy.stripe.com/6oUaEZ52pbZ135V7Nm7bW04',
      yearly: 'https://buy.stripe.com/8x23cxcuR9QTgWL7Nm7bW05',
    },
  },
  {
    key: 'pro',
    name: 'Professional',
    monthly: 199,
    yearly: 1990,
    description: 'Enterprise-grade solution for maximum scalability',
    color: 'gold',
    features: [
      'Unlimited products',
      'Unlimited orders',
      'Unlimited staff accounts',
      'Unlimited tables & QR codes',
      'Up to 10 branches',
      'Custom real-time reports',
      'Custom theme',
      'In-app, email & WhatsApp notifications',
      'Email + Chat + Phone support (24hr)',
      'Unlimited custom roles',
    ],
    links: {
      monthly: 'https://buy.stripe.com/5kQ5kFcuR8MP6i76Ji7bW06',
      yearly: 'https://buy.stripe.com/eVq7sNcuR2or21R2t27bW07',
    },
  },
];

const NO_TRIAL_LINKS = {
  starter: {
    monthly: 'https://buy.stripe.com/bJefZjdyV7ILeOD0kU7bW08',
    yearly:  'https://buy.stripe.com/8x26oJ2UhgfhbCr4Ba7bW09',
  },
  growth: {
    monthly: 'https://buy.stripe.com/14A00leCZ8MPbCr3x67bW0a',
    yearly:  'https://buy.stripe.com/28EdRb8eB3svcGv4Ba7bW0b',
  },
  pro: {
    monthly: 'https://buy.stripe.com/eVqdRb66tfbdbCrc3C7bW0c',
    yearly:  'https://buy.stripe.com/4gM3cxdyVd35aync3C7bW0d',
  },
};

const BADGE_COLORS = {
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  gold: 'bg-amber-100 text-amber-700',
};

const BUTTON_STYLES = {
  starter: { background: '#3b82f6' },
  growth: { background: 'var(--color-primary-gradient, linear-gradient(90deg,#6366f1,#8b5cf6))' },
  pro: { background: '#1e293b' },
};

const PLAN_RANK = { starter: 0, growth: 1, pro: 2 };

export default function UpgradeWall({ currentTier: currentTierProp = null }) {
  const [billing, setBilling] = useState('monthly');
  const { tenantId, subscription, user, tenant } = useTenant();

  const currentTier = currentTierProp ?? subscription?.tier ?? null;
  console.log('UpgradeWall currentTier:', currentTier);

  const getLink = (plan) => {
    const linkSet = tenant?.has_used_trial ? NO_TRIAL_LINKS[plan.key] : plan.links;
    const base = billing === 'annual' ? linkSet.yearly : linkSet.monthly;
    if (currentTier === null) return base;
    const params = new URLSearchParams();
    if (tenantId) params.set('client_reference_id', tenantId);
    if (user?.email) params.set('prefilled_email', user.email);
    params.set('upgraded', '1');
    return `${base}?${params.toString()}`;
  };

  const getButtonLabel = (plan) => {
    if (currentTier === null) return 'Get Started →';
    if (plan.key === currentTier) return 'Current Plan';
    const planRank = PLAN_RANK[plan.key] ?? 0;
    const currentRank = PLAN_RANK[currentTier] ?? 0;
    return planRank > currentRank ? 'Upgrade →' : 'Downgrade →';
  };

  const isCurrentPlan = (plan) => currentTier !== null && plan.key === currentTier;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-12">
      {/* Logo */}
      <img
        src="https://assets.apptelier.sg/sellio/Logo_Sellio.png"
        alt="Sellio"
        className="h-10 w-auto object-contain mb-10"
      />

      {/* Lock Icon */}
      <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
        <Lock className="w-9 h-9 text-red-500" />
      </div>

      {/* Heading */}
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-3">
        Your trial has ended
      </h1>
      <p className="text-slate-500 text-center max-w-md mb-8 text-sm leading-relaxed">
        Choose a plan to continue using Sellio. Your data is safe and will be restored immediately after upgrade.
      </p>

      {/* Pill Toggle */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <button
          onClick={() => setBilling('monthly')}
          className="text-sm font-medium px-5 py-1.5 rounded-full transition-all"
          style={billing === 'monthly'
            ? { background: 'var(--color-primary-gradient, linear-gradient(90deg,#6366f1,#8b5cf6))', color: '#fff' }
            : { color: '#64748b' }}
        >
          Monthly
        </button>
        <button
          onClick={() => setBilling('annual')}
          className="flex items-center gap-2 text-sm font-medium px-5 py-1.5 rounded-full transition-all"
          style={billing === 'annual'
            ? { background: 'var(--color-primary-gradient, linear-gradient(90deg,#6366f1,#8b5cf6))', color: '#fff' }
            : { color: '#64748b' }}
        >
          Annual
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">2 months free</span>
        </button>
      </div>

      {/* Pricing Cards — horizontal scroll on mobile */}
      <div
        className="w-full max-w-5xl flex md:grid md:grid-cols-3 gap-4 overflow-x-auto pb-4 md:overflow-x-visible px-4 md:px-0"
        style={{ scrollSnapType: 'x mandatory', scrollPadding: '0 16px' }}
      >
        {PLANS.map((plan) => {
          const isGrowth = plan.key === 'growth';
          const isCurrent = isCurrentPlan(plan);
          const price = billing === 'annual' ? plan.yearly : plan.monthly;
          const saving = plan.monthly * 12 - plan.yearly;

          return (
            <div
              key={plan.key}
              className={`relative bg-white rounded-2xl flex flex-col flex-shrink-0 w-[82vw] mx-1 md:mx-0 md:w-auto ${
                isCurrent
                  ? 'shadow-xl ring-2 ring-offset-2 ring-green-400'
                  : isGrowth
                  ? 'shadow-xl ring-2 ring-offset-2'
                  : 'shadow-sm border border-slate-200'
              }`}
              style={{ minHeight: 480, scrollSnapAlign: 'start' }}
            >
              {isGrowth && !isCurrent && (
                <div
                  className="absolute -top-px left-0 right-0 h-1 rounded-t-2xl"
                  style={{ background: 'var(--color-primary-gradient, linear-gradient(90deg,#6366f1,#8b5cf6))' }}
                />
              )}
              {isCurrent && (
                <div className="absolute -top-px left-0 right-0 h-1 rounded-t-2xl bg-green-400" />
              )}

              <div className="p-6 flex flex-col h-full" style={{ minHeight: 480 }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-bold text-slate-900">{plan.name}</h2>
                  <div className="flex items-center gap-1.5">
                    {isCurrent && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Current Plan
                      </span>
                    )}
                    {plan.badge && !isCurrent && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE_COLORS[plan.color]}`}>
                        {plan.badge}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price */}
                <div className="mt-3 mb-1">
                  <span className="text-3xl font-extrabold text-slate-900">SGD {price}</span>
                  <span className="text-sm text-slate-400 ml-1">/{billing === 'annual' ? 'year' : 'month'}</span>
                </div>
                {billing === 'annual' && (
                  <p className="text-xs text-green-600 font-medium mb-2">Save SGD {saving}</p>
                )}

                {/* Description */}
                <p className="text-xs text-slate-500 mb-5">{plan.description}</p>

                {/* Features */}
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                      <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA always at bottom */}
                {isCurrent ? (
                  <div
                    className="w-full font-semibold text-sm mt-auto flex items-center justify-center gap-1.5 select-none"
                    style={{
                      height: 44,
                      borderRadius: 10,
                      background: '#e2e8f0',
                      color: '#94a3b8',
                      opacity: 0.7,
                      pointerEvents: 'none',
                    }}
                  >
                    <Check className="w-4 h-4" />
                    Current Plan
                  </div>
                ) : (
                  <button
                    onClick={() => window.open(getLink(plan), '_blank')}
                    className="w-full font-semibold text-sm mt-auto"
                    style={{
                      ...BUTTON_STYLES[plan.key],
                      color: '#fff',
                      height: 44,
                      borderRadius: 10,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {getButtonLabel(plan)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Already have an account?{' '}
        <button
          onClick={async () => {
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('Sign out error:', e);
  }
  window.location.href = '/Auth';
}}
          className="font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2 bg-transparent border-none cursor-pointer p-0"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}