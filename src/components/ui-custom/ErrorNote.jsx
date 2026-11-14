import React from 'react';
import { TriangleAlert, WifiOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppText } from '@/lib/appText';

// An error that stays where the person is working (a form's footer, a checkout), until they
// try again or close it: what went wrong, then whose side it's on and what to do
// (lib/plainError.js explainError / offlineNote give the words).
export default function ErrorNote({ note, onDismiss, className, children }) {
  const { t } = useAppText();
  if (!note) return null;
  const Icon = note.kind === 'offline' || note.kind === 'network' ? WifiOff : TriangleAlert;
  return (
    <div
      role="alert"
      data-testid="error-note"
      data-kind={note.kind || undefined}
      className={cn('flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-left text-rose-800', className)}
    >
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-rose-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{note.title}</p>
        {note.description && <p className="mt-0.5 text-[13px] leading-relaxed text-rose-900">{note.description}</p>}
        {children}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('Close this message')}
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
