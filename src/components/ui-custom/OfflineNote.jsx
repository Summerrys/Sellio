import React from 'react';
import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadedAtText } from '@/lib/offlineStore';

// The words for a list shown without a fresh load: when it's from, and what still works.
//   online  — the phone's connection now
//   what    — 'orders', 'listings'
//   at      — when the list on screen was loaded
//   latest  — how many were kept on the phone, when that's fewer than there were
//   offlineText / failedText — what still works / what to do
export function listNoteWords({ online, what, at, latest, offlineText, failedText }, now = Date.now()) {
  const when = loadedAtText(at, now);
  const showing = latest ? `Showing your latest ${latest} ${what} from ${when}.` : `Showing ${what} from ${when}.`;
  return online
    ? { title: `Couldn’t update the ${what}. ${showing}`, text: failedText }
    : { title: `You’re offline. ${showing}`, text: offlineText };
}

// A list kept on screen while there's no connection (UX states, 4). action: { label, onClick }.
export default function OfflineNote({ title, text, action, className }) {
  if (!title) return null;
  return (
    <div role="status" data-testid="offline-note" className={cn('flex gap-2.5 rounded-xl border px-3 py-2.5', className)}
      style={{ background: '#fff7e6', borderColor: '#fde4b0', color: '#7c4a03' }}>
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug">{title}</p>
        {text && <p className="mt-0.5 text-xs leading-relaxed">{text}</p>}
      </div>
      {action && (
        <button type="button" onClick={action.onClick}
          className="-my-0.5 shrink-0 self-center rounded-full border px-3 py-1.5 text-xs font-semibold"
          style={{ borderColor: '#f5c16c', background: '#fff' }}>
          {action.label}
        </button>
      )}
    </div>
  );
}
