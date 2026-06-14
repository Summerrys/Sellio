import React from 'react';

export default function TrialReminderModal({ hoursLeft, onUpgrade, onDismiss }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.35)' }}>
      <div className="bg-white flex flex-col items-center text-center p-8 w-full max-w-[400px]" style={{ borderRadius: 20 }}>
        <div className="text-5xl mb-4">⏰</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Your trial ends soon</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          You have <span className="font-semibold text-slate-700">{hoursLeft} hour{hoursLeft !== 1 ? 's' : ''}</span> left. Upgrade now to keep your data and continue without interruption.
        </p>
        <button
          onClick={onUpgrade}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm mb-3"
          style={{ background: 'var(--color-primary-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))' }}
        >
          Choose a Plan
        </button>
        {onDismiss ? (
          <button
            onClick={onDismiss}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors border border-slate-200"
          >
            Remind me later
          </button>
        ) : (
          <p className="text-xs font-semibold text-red-500 mt-1">⚠️ Subscription not active — please choose a plan to continue.</p>
        )}
        <p className="text-xs text-slate-400 mt-4">Your data is safe and won't be deleted immediately.</p>
      </div>
    </div>
  );
}