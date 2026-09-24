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


// Sellio platform screen: same palette for every tenant, never the tenant theme.
// Matches the sign-up "View Plans" pricing card; the plan the merchant had is
// highlighted with the Sellio pink-purple gradient, other plans use the
// sign-up orange.
const SELLIO_PINK_PURPLE = 'linear-gradient(90deg, #e0449a, #8b2fc9)';
const SIGNUP_ORANGE = 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)';
const PLAN_RANK = { starter: 0, growth: 1, pro: 2 };

export default function UpgradeWall({ currentTier: currentTierProp = null }) {
  const [annual, setAnnual] = useState(false);
  const { tenantId, subscription, user, tenant } = useTenant();

  // Locked = cancelled, suspended, past due, or an expired trial. A locked
  // account has no current plan to protect: every plan is selectable, and the
  // plan it had is only used to highlight "Resubscribe".
  const subStatus = subscription?.status;
  const trialExpired = subStatus === 'trial' && subscription?.current_period_end
    && new Date(subscription.current_period_end) < new Date();
  const isLockedAccount = ['cancelled', 'suspended', 'past_due'].includes(subStatus) || !!trialExpired;
  const previousTier = subscription?.tier ?? null;
  const currentTier = isLockedAccount ? null : (currentTierProp ?? previousTier);

  const getLink = (plan) => {
    // A returning (locked) merchant never gets a second free trial.
    const linkSet = (isLockedAccount || tenant?.has_used_trial) ? NO_TRIAL_LINKS[plan.key] : plan.links;
    const base = annual ? linkSet.yearly : linkSet.monthly;
    // Always tie checkout to this store: stripe-webhook uses client_reference_id
    // to attach the new subscription to the EXISTING tenant and unlock it.
    if (!tenantId) return base;
    const params = new URLSearchParams();
    params.set('client_reference_id', tenantId);
    if (user?.email) params.set('prefilled_email', user.email);
    params.set('upgraded', '1');
    return `${base}?${params.toString()}`;
  };

  const isFocus = (plan) => isLockedAccount && plan.key === previousTier;

  const getButtonLabel = (plan) => {
    if (isLockedAccount) return isFocus(plan) ? 'Resubscribe →' : 'Choose plan →';
    if (currentTier === null) return 'Get Started →';
    if (plan.key === currentTier) return 'Current Plan';
    return (PLAN_RANK[plan.key] ?? 0) > (PLAN_RANK[currentTier] ?? 0) ? 'Upgrade →' : 'Downgrade →';
  };

  const isCurrentPlan = (plan) => currentTier !== null && plan.key === currentTier;

  const heading = subStatus === 'cancelled' ? 'Your subscription has ended' : 'Your trial has ended';
  const previousPlanName = PLANS.find(p => p.key === previousTier)?.name;

  const handleSignOut = async () => {
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    window.location.href = '/Auth';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10">
      <img
        src="https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png"
        alt="Sellio"
        className="h-12 sm:h-14 w-auto object-contain mb-8"
      />

      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 820, padding: '32px 24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-red-500" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', textAlign: 'center', marginBottom: 4 }}>{heading}</h1>
        <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
          {previousPlanName
            ? `Resubscribe to ${previousPlanName} or choose another plan to continue. Your data is safe and returns as soon as you subscribe.`
            : 'Choose a plan to continue using Sellio. Your data is safe and returns as soon as you subscribe.'}
        </p>

        {/* Monthly / Annual switch — same as the sign-up pricing card */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          <span onClick={() => setAnnual(false)} style={{ fontSize: 13, fontWeight: 500, color: !annual ? '#0f172a' : '#94a3b8', cursor: 'pointer' }}>Monthly</span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Bill annually"
            onClick={() => setAnnual(v => !v)}
            style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: annual ? '#16a34a' : '#cbd5e1', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}
          >
            <span style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: annual ? 22 : 2 }} />
          </button>
          <span onClick={() => setAnnual(true)} style={{ fontSize: 13, fontWeight: 500, color: annual ? '#0f172a' : '#94a3b8', cursor: 'pointer' }}>Annual</span>
          {annual && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d' }}>2 months free</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          {PLANS.map((plan) => {
            const focus = isFocus(plan);
            const current = isCurrentPlan(plan);
            const price = annual ? plan.yearly : plan.monthly;
            const saving = plan.monthly * 12 - plan.yearly;
            return (
              <div
                key={plan.key}
                style={{
                  position: 'relative', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  // Focus card: pink-purple gradient border. Others: no border.
                  border: focus ? '2px solid transparent' : 'none',
                  background: focus ? `linear-gradient(#fff, #fff) padding-box, ${SELLIO_PINK_PURPLE} border-box` : '#fff',
                  boxShadow: focus ? '0 6px 24px rgba(224,68,154,0.18)' : '0 1px 4px rgba(0,0,0,0.08)',
                }}
              >
                <div style={{ padding: '20px 20px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{plan.name}</span>
                    {focus && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#fce7f3', color: '#be185d', whiteSpace: 'nowrap' }}>Your previous plan</span>}
                    {current && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d', whiteSpace: 'nowrap' }}>Current plan</span>}
                  </div>
                  <div style={{ margin: '10px 0 2px' }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>SGD {price}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>/{annual ? 'year' : 'month'}</span>
                  </div>
                  {annual && <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 500, marginBottom: 4 }}>Save SGD {saving}</p>}
                  <p style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>{plan.description}</p>
                  <ul style={{ flex: 1, marginBottom: 16, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#475569' }}>
                        <Check style={{ width: 13, height: 13, color: '#22c55e', marginTop: 1, flexShrink: 0 }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {current ? (
                    <div style={{ width: '100%', padding: '10px 0', borderRadius: 12, fontSize: 13, fontWeight: 600, textAlign: 'center', background: '#e2e8f0', color: '#94a3b8' }}>
                      Current Plan
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => window.open(getLink(plan), '_blank')}
                      style={{
                        width: '100%', padding: '10px 0', borderRadius: 12, fontSize: 13, fontWeight: 600, color: '#fff', border: 'none', cursor: 'pointer',
                        background: focus ? SELLIO_PINK_PURPLE : SIGNUP_ORANGE,
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
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Wrong account?{' '}
        <button
          type="button"
          onClick={handleSignOut}
          className="font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2 bg-transparent border-none cursor-pointer p-0"
        >
          Sign out
        </button>
      </p>
    </div>
  );
}
