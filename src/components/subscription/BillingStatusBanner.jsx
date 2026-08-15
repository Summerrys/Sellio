import React, { useState } from 'react';
import { AlertTriangle, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { openBillingPortal, formatBillingAmount, formatBillingDate } from '@/lib/billing';
import { toast } from 'sonner';

export default function BillingStatusBanner({ subscription, tenantId, isOwner }) {
  const [openingPortal, setOpeningPortal] = useState(false);
  if (subscription?.status !== 'past_due') return null;

  const amount = formatBillingAmount(
    subscription.invoice_amount_due_minor,
    subscription.invoice_currency || subscription.currency,
  );
  const retryAt = formatBillingDate(subscription.next_payment_attempt);
  const graceEnds = formatBillingDate(subscription.grace_period_ends_at);

  const handleManageBilling = async () => {
    setOpeningPortal(true);
    try {
      await openBillingPortal(tenantId);
    } catch (error) {
      toast.error(error.message || 'Could not open billing');
      setOpeningPortal(false);
    }
  };

  return (
    <div className="mx-2 mt-3 sm:mx-6 lg:mx-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3 min-w-0">
          <div className="mt-0.5 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-950">
              Payment needs attention{amount ? ` · ${amount} due` : ''}
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              {retryAt ? `Stripe will retry on ${retryAt}.` : 'Please update the payment method or pay the open invoice.'}
              {graceEnds ? ` Store access remains available until ${graceEnds}.` : ''}
            </p>
          </div>
        </div>

        {isOwner ? (
          <div className="flex gap-2 flex-shrink-0">
            {subscription.invoice_hosted_url && (
              <a
                href={subscription.invoice_hosted_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-3 rounded-xl bg-amber-900 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-amber-950"
              >
                Pay invoice
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={handleManageBilling}
              disabled={openingPortal}
              className="h-10 px-3 rounded-xl border border-amber-300 bg-white text-amber-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-amber-100 disabled:opacity-60"
            >
              {openingPortal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
              Billing
            </button>
          </div>
        ) : (
          <p className="text-xs font-medium text-amber-900">Please ask the store owner to update billing.</p>
        )}
      </div>
    </div>
  );
}
