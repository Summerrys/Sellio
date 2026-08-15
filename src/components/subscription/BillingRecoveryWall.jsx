import React, { useState } from 'react';
import { AlertTriangle, CreditCard, ExternalLink, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { openBillingPortal, formatBillingAmount, formatBillingDate } from '@/lib/billing';
import { toast } from 'sonner';

export default function BillingRecoveryWall({ subscription, tenantId, isOwner }) {
  const [openingPortal, setOpeningPortal] = useState(false);
  const amount = formatBillingAmount(
    subscription?.invoice_amount_due_minor,
    subscription?.invoice_currency || subscription?.currency,
  );
  const nextAttempt = formatBillingDate(subscription?.next_payment_attempt);

  const handleManageBilling = async () => {
    setOpeningPortal(true);
    try {
      await openBillingPortal(tenantId);
    } catch (error) {
      toast.error(error.message || 'Could not open billing');
      setOpeningPortal(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
    } finally {
      window.location.href = '/Auth';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-7">
          <img
            src="https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png"
            alt="Sellio"
            className="h-10 w-auto object-contain mx-auto mb-8"
          />
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-7 h-7 text-amber-700" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Payment required</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            The latest subscription payment was not completed. Your store data is safe and access will resume automatically after Stripe confirms payment.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Outstanding invoice</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{amount || 'Payment overdue'}</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Past due</span>
          </div>

          {nextAttempt && (
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p>Stripe's next automatic attempt is scheduled for {nextAttempt}.</p>
            </div>
          )}

          {isOwner ? (
            <div className="space-y-2 pt-1">
              {subscription?.invoice_hosted_url && (
                <a
                  href={subscription.invoice_hosted_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-slate-900 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-800"
                >
                  Pay outstanding invoice
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button
                type="button"
                onClick={handleManageBilling}
                disabled={openingPortal}
                className="w-full h-11 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-60"
              >
                {openingPortal ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Update payment method
              </button>
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-900">
              Please contact the store owner to resolve the outstanding invoice.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="mx-auto mt-6 text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
