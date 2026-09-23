import React from 'react';
import { Lock, LogOut } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

// Shown to staff (non-owners) when the store's subscription has ended or its
// trial has expired. Only the owner can renew, so staff get a clear
// "ask your owner" message instead of plan cards they can't act on.
export default function SubscriptionEndedNotice({ subscription, storeName }) {
  const isTrial = subscription?.status === 'trial';

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
      <div className="w-full max-w-md text-center">
        <img
          src="https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png"
          alt="Sellio"
          className="h-16 sm:h-20 w-auto object-contain mx-auto mb-10"
        />
        <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-7 h-7 text-slate-600" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          {isTrial ? 'The free trial has ended' : 'This store’s subscription has ended'}
        </h1>
        <p className="text-sm text-slate-500 mt-3 leading-relaxed">
          Sellio is paused for {storeName || 'this store'}. Please ask the store owner to renew the plan.
          Your orders, menu and settings are kept safe and come back as soon as it is renewed.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mx-auto mt-8 text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
