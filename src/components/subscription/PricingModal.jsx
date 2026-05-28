import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 79,
    yearly: 790,
    description: 'Perfect for small businesses just getting started',
    color: 'blue',
    features: ['10 products', 'Up to 100 orders/month', '3 staff accounts', '5 tables & QR codes', '1 branch', 'Basic reports', 'Custom theme', 'In-app notifications', 'Email support (72hr)'],
    links: { monthly: 'https://buy.stripe.com/00wdRbdyV1kn8qfebK7bW02', yearly: 'https://buy.stripe.com/fZu5kF1Qd8MP0XN3x67bW03' },
  },
  {
    key: 'growth',
    name: 'Growth',
    monthly: 139,
    yearly: 1390,
    description: 'For growing businesses with higher demands',
    color: 'purple',
    badge: 'Most Popular',
    features: ['50 products', 'Up to 1,000 orders/month', '5 staff accounts', '5 tables & QR codes', 'Up to 3 branches', 'Advanced reports', 'Custom theme', 'In-app & email notifications', 'Email + Chat support (24hr)', 'Custom editable roles (up to 5)'],
    links: { monthly: 'https://buy.stripe.com/6oUaEZ52pbZ135V7Nm7bW04', yearly: 'https://buy.stripe.com/8x23cxcuR9QTgWL7Nm7bW05' },
  },
  {
    key: 'pro',
    name: 'Professional',
    monthly: 199,
    yearly: 1990,
    description: 'Enterprise-grade solution for maximum scalability',
    color: 'gold',
    features: ['Unlimited products', 'Unlimited orders', 'Unlimited staff accounts', 'Unlimited tables & QR codes', 'Up to 10 branches', 'Custom real-time reports', 'Custom theme', 'In-app, email & WhatsApp notifications', 'Email + Chat + Phone support (24hr)', 'Unlimited custom roles'],
    links: { monthly: 'https://buy.stripe.com/5kQ5kFcuR8MP6i76Ji7bW06', yearly: 'https://buy.stripe.com/eVq7sNcuR2or21R2t27bW07' },
  },
];

const BADGE_COLORS = {
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  gold: 'bg-amber-100 text-amber-700',
};

export default function PricingModal({ open, onOpenChange, tenantId }) {
  const [annual, setAnnual] = useState(false);

  const getLink = (plan) => {
    const base = annual ? plan.links.yearly : plan.links.monthly;
    return tenantId ? `${base}?client_reference_id=${tenantId}` : base;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">Choose Your Plan</DialogTitle>
        </DialogHeader>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <span className={`text-sm font-medium ${!annual ? 'text-slate-900' : 'text-slate-400'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(v => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-slate-800' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? 'text-slate-900' : 'text-slate-400'}`}>Annual</span>
          {annual && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">2 months free</span>}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isGrowth = plan.key === 'growth';
            const price = annual ? plan.yearly : plan.monthly;
            const saving = plan.monthly * 12 - plan.yearly;

            return (
              <div
                key={plan.key}
                className={`relative bg-white rounded-2xl flex flex-col ${isGrowth ? 'shadow-lg ring-2 ring-offset-1' : 'shadow-sm border border-slate-200'}`}
              >
                {isGrowth && (
                  <div className="absolute -top-px left-0 right-0 h-1 rounded-t-2xl" style={{ background: 'var(--color-primary-gradient, linear-gradient(90deg,#6366f1,#8b5cf6))' }} />
                )}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-slate-900">{plan.name}</h3>
                    {plan.badge && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE_COLORS[plan.color]}`}>{plan.badge}</span>}
                  </div>
                  <div className="mt-2 mb-1">
                    <span className="text-2xl font-extrabold text-slate-900">SGD {price}</span>
                    <span className="text-xs text-slate-400 ml-1">/{annual ? 'year' : 'month'}</span>
                  </div>
                  {annual && <p className="text-xs text-green-600 font-medium mb-2">Save SGD {saving}</p>}
                  <p className="text-xs text-slate-500 mb-4">{plan.description}</p>
                  <ul className="space-y-1.5 flex-1 mb-4">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <Check className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href={getLink(plan)} target="_blank" rel="noopener noreferrer" className="block">
                    <Button
                      className="w-full text-white font-semibold text-sm"
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
      </DialogContent>
    </Dialog>
  );
}