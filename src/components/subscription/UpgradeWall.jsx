import React, { useState } from 'react';
import { Lock, Check, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '../tenant/TenantContext';

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

const COLOR_STYLES = {
  blue: { icon: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  purple: { icon: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
  gold: { icon: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
};

export default function UpgradeWall() {
  const [annual, setAnnual] = useState(false);
  const { tenantId } = useTenant();

  const getLink = (plan) => {
    const base = annual ? plan.links.yearly : plan.links.monthly;
    return tenantId ? `${base}?client_reference_id=${tenantId}` : base;
  };

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

      {/* Monthly / Annual Toggle */}
      <div className="flex items-center gap-3 mb-10">
        <span className={`text-sm font-medium ${!annual ? 'text-slate-900' : 'text-slate-400'}`}>Monthly</span>
        <button
          onClick={() => setAnnual(v => !v)}
          className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-slate-800' : 'bg-slate-300'}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-7' : 'translate-x-1'}`}
          />
        </button>
        <span className={`text-sm font-medium ${annual ? 'text-slate-900' : 'text-slate-400'}`}>Annual</span>
        {annual && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            2 months free
          </span>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isGrowth = plan.key === 'growth';
          const colors = COLOR_STYLES[plan.color];
          const price = annual ? plan.yearly : plan.monthly;
          const saving = plan.monthly * 12 - plan.yearly;

          return (
            <div
              key={plan.key}
              className={`relative bg-white rounded-2xl flex flex-col ${
                isGrowth
                  ? 'shadow-xl ring-2 ring-offset-2'
                  : 'shadow-sm border border-slate-200'
              }`}
              style={isGrowth ? { ringColor: 'rgb(var(--color-primary, 99 102 241))' } : {}}
            >
              {isGrowth && (
                <div
                  className="absolute -top-px left-0 right-0 h-1 rounded-t-2xl"
                  style={{ background: 'var(--color-primary-gradient, linear-gradient(90deg,#6366f1,#8b5cf6))' }}
                />
              )}

              <div className="p-6 flex-1 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-bold text-slate-900">{plan.name}</h2>
                  {plan.badge && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                      {plan.badge}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="mt-3 mb-1">
                  <span className="text-3xl font-extrabold text-slate-900">SGD {price}</span>
                  <span className="text-sm text-slate-400 ml-1">/{annual ? 'year' : 'month'}</span>
                </div>
                {annual && (
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

                {/* CTA */}
                <a
                  href={getLink(plan)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button
                    className="w-full text-white font-semibold"
                    style={isGrowth ? { background: 'var(--color-primary-gradient, linear-gradient(90deg,#6366f1,#8b5cf6))' } : {}}
                    variant={isGrowth ? 'default' : 'outline'}
                  >
                    Get Started
                  </Button>
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}