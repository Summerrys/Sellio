import React from 'react';
import { Search } from 'lucide-react';

// A search or filter that found nothing (UX state 6): what was looked for, why nothing
// shows, and one next step (as OrdersEmpty does for Orders).
const GHOST = 'h-10 max-w-full truncate px-5 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-transform';

export default function NoMatches({ icon: Icon = Search, title, text, actionLabel, onAction, testId = 'no-matches' }) {
  return (
    <div className="text-center py-12 px-4" data-testid={testId}>
      <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-slate-900 break-words">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto">{text}</p>}
      {actionLabel && (
        <div className="mt-5">
          <button type="button" onClick={onAction} className={GHOST}>{actionLabel}</button>
        </div>
      )}
    </div>
  );
}

// "Did you mean kaya toast?", the spelling a tap away (lib/searchSuggest.js finds it).
export function DidYouMean({ suggestion, onPick }) {
  return (
    <span data-testid="did-you-mean">
      Did you mean{' '}
      <button
        type="button"
        onClick={() => onPick(suggestion)}
        className="font-bold text-violet-700 underline underline-offset-[3px] decoration-violet-300 hover:text-violet-800"
      >
        {suggestion}
      </button>
      ?
    </span>
  );
}
