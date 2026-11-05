import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { FEATURE_LABELS } from '@/lib/planFeatures';

// Shown instead of a page the store's plan doesn't include (for example the
// Counter or Inventory on a free personal shop).
export default function PlanFeatureNotice({ feature, personal = true }) {
  const label = FEATURE_LABELS[feature] || 'This page';
  return (
    <div data-testid="plan-feature-notice" className="max-w-md mx-auto mt-10 bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-7 h-7 text-orange-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Not part of your plan</h2>
      <p className="text-sm text-slate-500 mb-5">
        {label} isn’t included in your plan.{' '}
        {personal
          ? 'It comes with a business plan; moving a personal shop to a business plan is coming soon.'
          : 'Email sellio@apptelier.sg to change your plan.'}
      </p>
      <Link
        to={createPageUrl('Dashboard')}
        className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
