import React from 'react';
import { BarChart3 } from 'lucide-react';
import { differenceInCalendarDays, format } from 'date-fns';
import ShareShopLinkButton from '@/components/shop/ShareShopLink';

// Reports with no orders in the chosen days (Alvin, 7 Nov 2026: say why it's empty, then one
// next step). A few days chosen: back to the last 30 days, the usual view. The last 30 days
// or more: nothing came in, so the step is getting orders, with the shop's link.
export const USUAL_DAYS = 30;

// "9 Oct and 7 Nov"; with the years when either day isn't in this year.
export function emptyRangeTitle(from, to, now = new Date()) {
  if (!from || !to) return 'No orders in these days';
  const pattern = from.getFullYear() === now.getFullYear() && to.getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM yyyy';
  if (differenceInCalendarDays(to, from) === 0) return `No orders on ${format(from, pattern)}`;
  return `No orders between ${format(from, pattern)} and ${format(to, pattern)}`;
}

export default function ReportsEmpty({ dateRange, onShowUsualDays, now = new Date() }) {
  const from = dateRange?.from;
  const to = dateRange?.to || dateRange?.from;
  const days = from && to ? differenceInCalendarDays(to, from) + 1 : USUAL_DAYS;
  const shortRange = days < USUAL_DAYS;
  return (
    <div className="text-center py-12 px-4" data-testid="reports-empty">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
        <BarChart3 className="w-7 h-7" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-slate-900">{emptyRangeTitle(from, to, now)}</p>
      <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto">Reports are made from your orders, so they fill in as orders come in.</p>
      <div className="mt-5">
        {shortRange ? (
          <button
            type="button"
            onClick={onShowUsualDays}
            className="h-10 px-5 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-transform"
          >
            Show the last {USUAL_DAYS} days
          </button>
        ) : (
          <ShareShopLinkButton />
        )}
      </div>
    </div>
  );
}
