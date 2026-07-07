import React, { useState } from 'react';
import { X, Check } from 'lucide-react';

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 79,
    yearly: 790,
    description: 'Perfect for small businesses just getting started',
    features: ['10 products', 'Up to 100 orders/month', '3 staff accounts', '5 tables & QR codes', '1 branch', 'Basic reports'],
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
    badge: 'Most Popular',
    features: ['50 products', 'Up to 1,000 orders/month', '5 staff accounts', 'Up to 3 branches', 'Advanced reports', 'Custom editable roles'],
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
    features: ['Unlimited products', 'Unlimited orders', 'Unlimited staff', 'Up to 10 branches', 'Custom reports', 'Unlimited roles'],
    links: {
      monthly: 'https://buy.stripe.com/5kQ5kFcuR8MP6i76Ji7bW06',
      yearly: 'https://buy.stripe.com/eVq7sNcuR2or21R2t27bW07',
    },
  },
];

export default function AuthPricingModal({ onClose }) {
  const [annual, setAnnual] = useState(false);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 780, position: 'relative', padding: '32px 24px 28px' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <X style={{ width: 16, height: 16, color: '#64748b' }} />
        </button>

        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', textAlign: 'center', marginBottom: 4 }}>Choose a plan to get started</h2>
        <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20 }}>Start your 3-day free trial. No charge until trial ends.</p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          <span onClick={() => setAnnual(false)} style={{ fontSize: 13, fontWeight: 500, color: !annual ? '#0f172a' : '#94a3b8', cursor: 'pointer' }}>Monthly</span>
          <button
            onClick={() => setAnnual(v => !v)}
            style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: annual ? '#16a34a' : '#cbd5e1', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}
          >
            <span style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: annual ? 22 : 2 }} />
          </button>
          <span onClick={() => setAnnual(true)} style={{ fontSize: 13, fontWeight: 500, color: annual ? '#0f172a' : '#94a3b8', cursor: 'pointer' }}>Annual</span>
          {annual && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d' }}>2 months free</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {PLANS.map((plan) => {
            const isGrowth = plan.key === 'growth';
            const price = annual ? plan.yearly : plan.monthly;
            const saving = plan.monthly * 12 - plan.yearly;
            const link = annual ? plan.links.yearly : plan.links.monthly;
            return (
              <div
                key={plan.key}
                style={{
                  position: 'relative', background: '#fff', borderRadius: 16, display: 'flex', flexDirection: 'column',
                  overflow: 'hidden',
                  boxShadow: isGrowth ? '0 4px 24px rgba(139,92,246,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
                  border: isGrowth ? '2px solid #a78bfa' : '1px solid #e2e8f0',
                }}
              >
                {isGrowth && <div style={{ position: 'absolute', top: -1, left: 0, right: 0, height: 4, borderRadius: '16px 16px 0 0', background: 'linear-gradient(90deg, #8b5cf6, #6366f1)' }} />}
                <div style={{ padding: '20px 20px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{plan.name}</span>
                    {plan.badge && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#7c3aed' }}>{plan.badge}</span>}
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
                  <a href={link} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                    <button
                      style={{
                        width: '100%', padding: '10px 0', borderRadius: 12, fontSize: 13, fontWeight: 600, color: '#fff', border: 'none', cursor: 'pointer',
                        background: isGrowth ? 'linear-gradient(90deg, #8b5cf6, #6366f1)' : 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)',
                      }}
                    >
                      Start Free Trial
                    </button>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}