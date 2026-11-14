import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { FEATURE_LABELS } from '@/lib/planFeatures';
import { PLANS_ON_WEBSITE } from '@/lib/nativeApp';
import { useAppText, N_ } from '@/lib/appText';

// Shown instead of a page the store's plan doesn't include (for example the
// Counter or Inventory on a free personal shop). A free home shop's owner can move it to a
// business plan from here (onSeePlans: the plan window, "Upgrade to Business"), with the free
// trial if the shop hasn't had one (freeTrial); without onSeePlans (not the owner, or where
// Sellio sells no plans: sellsPlans), where plans are managed.
export default function PlanFeatureNotice({ feature, personal = true, onSeePlans = null, freeTrial = false }) {
  const { t } = useAppText();
  const label = t(FEATURE_LABELS[feature] || N_('This page'));
  let how = t('Email sellio@apptelier.sg to change your plan.');
  if (personal) {
    how = onSeePlans
      ? (freeTrial
        ? t('It comes with a business plan, free for 7 days. Your shop keeps its link, listings and orders.')
        : t('It comes with a business plan. Your shop keeps its link, listings and orders.'))
      : t('It comes with a business plan. {plans}.', { plans: t(PLANS_ON_WEBSITE) });
  }
  return (
    <div data-testid="plan-feature-notice" className="max-w-md mx-auto mt-10 bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-7 h-7 text-orange-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('Not part of your plan')}</h2>
      <p className="text-sm text-slate-500 mb-5">
        {t('{label} isn’t included in your plan. {how}', { label, how })}
      </p>
      <div className="flex flex-col items-center gap-2">
        {personal && onSeePlans && (
          <button
            type="button"
            onClick={onSeePlans}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)' }}
          >
            {t('Upgrade to Business')}
          </button>
        )}
        <Link
          to={createPageUrl('Dashboard')}
          className={personal && onSeePlans
            ? 'inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 bg-white'
            : 'inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white'}
          style={personal && onSeePlans ? undefined : { background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
        >
          {t('Back to Dashboard')}
        </Link>
      </div>
    </div>
  );
}
