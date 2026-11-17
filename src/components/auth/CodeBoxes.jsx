import React, { useState } from 'react';
import { fieldProps } from '@/components/ui-custom/FieldError';

// The email code's six boxes on the login page (Alvin, 17 Nov 2026). One real field lies over
// the boxes, so a pasted code ("Your code is 482 731" too), the phone's code suggestion and
// Backspace work as in any field; the boxes show its digits and, while it has the focus, where
// the next digit goes. Typing always adds at the end, as boxes would. Styles: index.css
// (.login-code). While a code is being checked the field takes no typing but keeps the focus,
// so the next try can be typed straight away.
export default function CodeBoxes({ id, value, onChange, length = 6, error, busy = false }) {
  const [focused, setFocused] = useState(false);
  const toEnd = (e) => {
    const field = e.currentTarget;
    const end = field.value.length;
    if (field.selectionStart !== end || field.selectionEnd !== end) {
      try { field.setSelectionRange(end, end); } catch { /* not a text field */ }
    }
  };
  return (
    <div className={`login-code${error ? ' bad' : ''}`} data-testid="login-code">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={value}
        readOnly={busy}
        aria-busy={busy || undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={(e) => { setFocused(true); toEnd(e); }}
        onBlur={() => setFocused(false)}
        onSelect={toEnd}
        className="login-code-input"
        {...fieldProps(id, error)}
      />
      <div className="login-code-boxes" aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`login-code-box${focused && i === Math.min(value.length, length - 1) ? ' on' : ''}`}>{value[i] || ''}</span>
        ))}
      </div>
    </div>
  );
}
