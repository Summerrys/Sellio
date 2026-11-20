import React, { useState } from 'react';
import { X, Check, CircleCheck } from 'lucide-react';
import { paymentLinkFor } from '@/lib/accountFlow';
import { RUPIAH_NOTE, plansFor, rupiahAmount } from '@/lib/plans';
import { usePlanRegion } from '@/lib/usePlanRegion';
import PlanFootnotes from '@/components/subscription/PlanFootnotes';
import { useBackToClose } from '@/lib/useBackToClose';
import { sellsPlans, outsideLinkProps } from '@/lib/nativeApp';
import PlansOnWebsite from '@/components/subscription/PlansOnWebsite';
import { useAppText, N_ } from '@/lib/appText';
import { forgetReferral, keepReferral, referralCode, referralCodeInfo, useKeptReferral, withReferral } from '@/lib/referral';

// Presentation only: prices, Stripe links and features come from lib/plans.js.
const PLAN_STYLE = {
  starter: { description: N_('Perfect for small businesses just getting started') },
  growth: { description: N_('For growing businesses with higher demands'), badge: N_('Most Popular') },
  pro: { description: N_('Enterprise-grade solution for maximum scalability') },
};

// A distributor's code for this sign-up (Refer & earn, lib/referral.js): the one kept from their
// link, or one typed here ("Have a referral code?"), which takes the link's place. The plan
// buttons carry it into Stripe's checkout (client_reference_id=ref_CODE).
function ReferralCodeField({ t }) {
  const kept = useKeptReferral();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const apply = async (event) => {
    event.preventDefault();
    const code = referralCode(typed);
    if (!code) { setError(t("That referral code isn't valid.")); return; }
    setChecking(true);
    setError('');
    try {
      const info = await referralCodeInfo(code);
      if (info?.found) {
        keepReferral({ ...info, typed: true });
        setTyped('');
        setOpen(false);
      } else {
        setError(t("That referral code isn't valid."));
      }
    } catch {
      setError(t('Couldn’t check that code. Check your connection and try again.'));
    } finally {
      setChecking(false);
    }
  };

  if (kept) {
    const who = kept.firstName && kept.shopName ? t('{name} from {shop}', { name: kept.firstName, shop: kept.shopName }) : kept.shopName || kept.firstName;
    return (
      <div data-testid="signup-referral" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '4px 10px', marginBottom: 18, fontSize: 13 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#047857' }}>
          <CircleCheck style={{ width: 16, height: 16 }} aria-hidden="true" />
          {t('Referral code {code} applied', { code: kept.code })}
        </span>
        {who && <span style={{ color: '#64748b' }}>{t('Invited by {who}', { who })}</span>}
        <button type="button" onClick={forgetReferral} style={{ background: 'none', border: 'none', padding: '4px 2px', fontSize: 13, fontWeight: 600, color: '#475569', textDecoration: 'underline', cursor: 'pointer' }}>
          {t('Remove')}
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <button type="button" onClick={() => setOpen(true)} data-testid="signup-referral-open" style={{ background: 'none', border: 'none', padding: '6px 4px', fontSize: 13, fontWeight: 600, color: '#7c3aed', cursor: 'pointer' }}>
          {t('Have a referral code?')}
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={apply} style={{ maxWidth: 360, margin: '0 auto 18px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          aria-label={t('Referral code')}
          value={typed}
          onChange={(e) => { setTyped(e.target.value); setError(''); }}
          placeholder={t('Referral code')}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          autoFocus
          data-testid="signup-referral-input"
          style={{ flex: 1, minWidth: 0, height: 44, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
        />
        <button type="submit" disabled={checking} style={{ height: 44, padding: '0 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, fontWeight: 600, color: '#334155', cursor: 'pointer', opacity: checking ? 0.6 : 1 }}>
          {t('Apply')}
        </button>
      </div>
      {error && <p role="alert" style={{ marginTop: 6, fontSize: 13, color: '#be123c' }}>{error}</p>}
    </form>
  );
}

// prefilledEmail: a signed-in account's email, locked on the Stripe page so the
// business plan it pays for belongs to this account. There's no shop yet, so the visitor's
// phone or computer decides the prices (Indonesia's or the rest's, usePlanRegion).
export default function AuthPricingModal({ onClose, prefilledEmail = '' }) {
  const { t } = useAppText();
  const [annual, setAnnual] = useState(false);
  const region = usePlanRegion();
  const PLANS = plansFor(region).map((plan) => ({ ...plan, ...PLAN_STYLE[plan.key] }));
  const kept = useKeptReferral();
  useBackToClose(true, onClose); // phone / browser Back closes the plans (shown only while open)

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

        {!sellsPlans() ? (
          // Sellio's apps sell no plans.
          <div style={{ padding: '8px 8px 0' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', textAlign: 'center', marginBottom: 12 }}>{t('Business plans')}</h2>
            <PlansOnWebsite className="text-center" />
          </div>
        ) : (
        <>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', textAlign: 'center', marginBottom: 4 }}>{t('Choose a plan to get started')}</h2>
        <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 14 }}>{t('Start your 7-day free trial. No charge until trial ends.')}</p>
        <ReferralCodeField t={t} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          <span onClick={() => setAnnual(false)} style={{ fontSize: 13, fontWeight: 500, color: !annual ? '#0f172a' : '#94a3b8', cursor: 'pointer' }}>{t('Monthly')}</span>
          <button
            onClick={() => setAnnual(v => !v)}
            style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: annual ? '#16a34a' : '#cbd5e1', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}
          >
            <span style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: annual ? 22 : 2 }} />
          </button>
          <span onClick={() => setAnnual(true)} style={{ fontSize: 13, fontWeight: 500, color: annual ? '#0f172a' : '#94a3b8', cursor: 'pointer' }}>{t('Annual')}</span>
          {annual && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d' }}>{t('2 months free')}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {PLANS.map((plan) => {
            const isGrowth = plan.key === 'growth';
            const price = annual ? plan.yearly : plan.monthly;
            const saving = plan.monthly * 12 - plan.yearly;
            const link = withReferral(paymentLinkFor(annual ? plan.links.yearly : plan.links.monthly, prefilledEmail), kept?.code, { typed: kept?.typed });
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
                    {plan.badge && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#7c3aed' }}>{t(plan.badge)}</span>}
                  </div>
                  <div style={{ margin: '10px 0 2px' }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>SGD {price}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>/{annual ? t('year') : t('month')}</span>
                  </div>
                  {region === 'ID' && <p data-testid="plan-rupiah" style={{ fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>{t(RUPIAH_NOTE, { amount: rupiahAmount(price) })}</p>}
                  {annual && <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 500, marginBottom: 4 }}>{t('Save SGD {saving}', { saving })}</p>}
                  <p style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>{t(plan.description)}</p>
                  <ul style={{ flex: 1, marginBottom: 16, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#475569' }}>
                        <Check style={{ width: 13, height: 13, color: '#22c55e', marginTop: 1, flexShrink: 0 }} />
                        {t(f)}
                      </li>
                    ))}
                  </ul>
                  <a {...outsideLinkProps(link)} style={{ display: 'block' }}>
                    <button
                      style={{
                        width: '100%', padding: '10px 0', borderRadius: 12, fontSize: 13, fontWeight: 600, color: '#fff', border: 'none', cursor: 'pointer',
                        background: isGrowth ? 'linear-gradient(90deg, #8b5cf6, #6366f1)' : 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)',
                      }}
                    >
                      {t('Start Free Trial')}
                    </button>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
        <PlanFootnotes region={region} />
        </>
        )}
      </div>
    </div>
  );
}