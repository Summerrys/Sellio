import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBackToClose } from '@/lib/useBackToClose';
import { BOTTOM_INSET } from './shared';

// A panel that rises from the bottom of the screen (centred on wider screens) over a
// dimmed page. The phone's Back, Escape, a tap outside and the panel's own ✕ close it.
// `footer` stays in view below the part that scrolls.
export default function BottomSheet({ open, onClose, labelledBy, footer = null, children, zIndex = 70 }) {
  const panelRef = useRef(null);
  useBackToClose(open, onClose);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus moves into the panel, and back to what opened it afterwards.
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (before && typeof before.focus === 'function' && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-pull-refresh-block
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex }}
    >
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.45)' }} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-white flex flex-col outline-none"
        style={{ maxHeight: '90vh', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 30px rgba(15,23,42,0.18)' }}
      >
        <div aria-hidden="true" className="w-10 h-1 rounded-full bg-slate-200 mx-auto mt-2 flex-shrink-0" />
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-1.5" style={{ paddingBottom: footer ? 12 : `calc(20px + ${BOTTOM_INSET})` }}>
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0 px-4 pt-3 border-t border-slate-100" style={{ paddingBottom: `calc(12px + ${BOTTOM_INSET})` }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
