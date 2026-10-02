import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Gauge } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useSubscription } from '@/hooks/useSubscription';

// "Orders this month: 32 / 100" for plans with a monthly order cap (Starter,
// Growth). The database pauses new orders at the cap, so the merchant sees it
// coming. Shows nothing on plans without a cap (Pro) or until the plan has loaded.
export default function OrderUsageMeter() {
  const { orderUsage, plan } = useSubscription();
  // No Upgrade link on a personal shop yet (moving to a business plan is step 3).
  return <OrderUsageBar usage={orderUsage} canUpgrade={plan !== 'personal'} />;
}

export function OrderUsageBar({ usage, canUpgrade = true }) {
  if (!usage) return null;
  const { used, limit, resetsAt } = usage;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const full = used >= limit;
  const near = !full && pct >= 80;
  const countClass = full ? 'font-semibold text-red-600' : near ? 'font-semibold text-amber-600' : 'text-slate-500';
  const barStyle = full ? { background: '#ef4444' } : near ? { background: '#f59e0b' } : { background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' };

  return (
    <div data-testid="order-usage-meter" className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-slate-600">
          <Gauge className="w-3.5 h-3.5" /> Orders this month
        </span>
        <span className={countClass}>{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div
        className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-label="Orders this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, ...barStyle }} />
      </div>
      {(full || near || resetsAt) && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            {full
              ? (resetsAt
                ? `Limit reached: orders paused until ${format(resetsAt, 'd MMM')}`
                : 'Limit reached: new orders are paused')
              : resetsAt ? `Resets ${format(resetsAt, 'd MMM')}` : null}
          </span>
          {(full || near) && canUpgrade && (
            <Link to={createPageUrl('TenantSettings')} className="font-medium text-slate-600 underline underline-offset-2 whitespace-nowrap">
              Upgrade
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
