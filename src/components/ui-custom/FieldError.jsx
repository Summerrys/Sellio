import React from 'react';
import { AlertCircle } from 'lucide-react';

// A form's problems on the form itself (UX state 9, 16 Nov 2026): the field with the problem
// turns red and says what's wrong right under it, rather than a pop-up that goes away.
// Used by the sign-in page (pages/Auth.jsx) and the free sign-up (pages/Join.jsx).

// An email address in a message ("…or contact sellio@apptelier.sg.") is a link that opens the
// email app, so they can write to us straight away (Alvin, 17 Nov 2026). Any language: the
// address is the same in every translation.
const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/;
export function withEmailLinks(message) {
  if (typeof message !== 'string') return message;
  const parts = message.split(EMAIL);
  if (parts.length === 1) return message;
  return parts.map((part, i) => (i % 2 === 1
    ? <a key={i} href={`mailto:${part}`} className="font-semibold underline underline-offset-2 whitespace-nowrap">{part}</a>
    : part));
}

// Under a field: what's wrong with it. The field points to it with aria-describedby (see
// fieldProps), so a screen reader reads it with the field.
export function FieldError({ id, children }) {
  if (!children || children === true) return null;
  return (
    <p id={id} data-field-error="" className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
      <span>{withEmailLinks(children)}</span>
    </p>
  );
}

// A problem that isn't one field's (the network, too many tries): above the form's button,
// and it stays until the next try.
export function FormError({ children }) {
  if (!children) return null;
  return (
    <div role="alert" data-form-error="" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-xs text-red-700 leading-relaxed">{withEmailLinks(children)}</p>
    </div>
  );
}

// The border and focus ring of a field: red when it has a problem (error is its message, or
// true for a field marked with its neighbour's message, like the phone number beside a
// password that doesn't match it), else the usual orange.
export function fieldBorder(error) {
  return error
    ? 'border-red-400 bg-red-50/40 focus:ring-red-200 focus:border-red-500'
    : 'border-slate-200 focus:ring-orange-300 focus:border-orange-400';
}

// The field's own attributes for its problem: aria-invalid, and aria-describedby pointing at
// its FieldError (only when there's a message to read).
export function fieldProps(id, error) {
  return {
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': typeof error === 'string' && error ? `${id}-error` : undefined,
  };
}

// The first field with a problem gets the focus (the phone's keyboard opens on it), in the
// order the fields are on screen.
export function focusFirst(errors, order, idOf = (name) => name) {
  const first = order.find((name) => errors[name]);
  if (!first || typeof document === 'undefined') return;
  const el = document.getElementById(idOf(first));
  if (!el) return;
  el.focus();
  try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* older browsers */ }
}
