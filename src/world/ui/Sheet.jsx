import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// A panel that slides up from the bottom on phones and docks to the right on
// wide screens. Closed sheets are inert, so keyboard focus never lands in them.
export function Sheet({ open, labelId, className = '', children, panelRef }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open || coarse()) return undefined;
    const id = setTimeout(() => ref.current?.querySelector('[data-close]')?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(id);
  }, [open]);
  const setRef = (el) => { ref.current = el; if (panelRef) panelRef.current = el; };
  return (
    <section
      ref={setRef}
      className={`pw-sheet ${className}${open ? ' open' : ''}`}
      role="dialog"
      aria-labelledby={labelId}
      aria-hidden={!open}
      inert={open ? undefined : ''}
    >
      <div className="pw-grab" aria-hidden="true" />
      {children}
    </section>
  );
}

export function CloseButton({ onClick, label = 'Close' }) {
  return (
    <button type="button" className="pw-x" data-close onClick={onClick} aria-label={label}>
      <X size={18} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}

export function Coin({ small }) {
  return <span className={`pw-coin${small ? ' sm' : ''}`} aria-hidden="true" />;
}

export function Bar({ value, max, label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 100;
  return (
    <div className="pw-bar" role="progressbar" aria-valuemin={0} aria-valuemax={max || 1} aria-valuenow={Math.min(value, max || value)} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
