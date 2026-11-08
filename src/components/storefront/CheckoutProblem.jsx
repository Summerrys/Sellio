import React from 'react';
import { TriangleAlert, WifiOff } from 'lucide-react';
import { ownMessage } from '@/lib/plainError';
import { isNetworkError } from '@/lib/network';

// An order that didn't go through stays on the checkout (UX states, 3): whether it reached
// the shop, that nothing was paid, and a way round it. Kinds:
//   offline     — the phone had no connection, so nothing was sent
//   rejected    — the shop's system said no, with its reason (an item no longer available…)
//   failed      — the shop's system said no, with no reason fit to show (on Sellio's side)
//   storage     — the browser wouldn't keep the order's key, so nothing was sent
//   unconfirmed — sent, but no answer came back: it may have arrived (Try again finds out;
//                 the same key can't order twice, see place_order_once)
//   earlier     — an earlier order is unconfirmed and this one is different: nothing sent
export function checkoutProblemFor(error) {
  if (error?.checkoutEarlier) return { kind: 'earlier' };
  if (error?.checkoutStorage) return { kind: 'storage' };
  if (error?.checkoutUnconfirmed || isNetworkError(error)) return { kind: 'unconfirmed' };
  const reason = ownMessage(error);
  if (reason) return { kind: 'rejected', reason: /[.!?…]$/.test(reason) ? reason : `${reason}.` };
  return { kind: 'failed' };
}

// The heading and the words under it, in the page's language.
export function problemWords(problem, { t, lang, shop }) {
  const fill = (text) => text.replace('{shop}', shop || '');
  const join = (a, b) => (lang === 'zh' ? `${a}${b}` : `${a} ${b}`);
  switch (problem?.kind) {
    case 'offline': return { title: t('orderNotSent'), text: join(fill(t('orderOffline')), t('nothingSentNotPaid')) };
    case 'rejected': return { title: t('orderNotSent'), text: join(problem.reason, t('nothingSentNotPaid')) };
    case 'storage': return { title: t('orderNotSent'), text: t('orderStorage') };
    case 'unconfirmed': return { title: t('orderUnconfirmed'), text: fill(t('orderUnconfirmedText')) };
    case 'earlier': return { title: t('orderEarlier'), text: fill(t('orderEarlierText')) };
    default: return { title: t('orderNotSent'), text: join(t('orderFailed'), t('nothingSentNotPaid')) };
  }
}

const BUTTON = { width: '100%', minHeight: 46, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px' };

// The box at the top of the checkout. online: the phone's connection now (shown when the
// problem happened offline: waiting, or back and ready to send).
export function CheckoutProblem({ problem, t, lang, shop, online }) {
  if (!problem) return null;
  const { title, text } = problemWords(problem, { t, lang, shop });
  const Icon = problem.kind === 'offline' ? WifiOff : TriangleAlert;
  return (
    <div role="alert" data-testid="checkout-problem" data-kind={problem.kind}
      style={{ border: '1px solid #fecdd3', background: '#fff1f2', borderRadius: 14, padding: 12, display: 'flex', gap: 10, color: '#9f1239', marginBottom: 14 }}>
      <Icon size={20} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700 }}>{title}</p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#881337' }}>{text}</p>
        {problem.offline && (
          <p data-testid="checkout-connection" style={{ margin: '6px 0 0', fontSize: 12.5, fontWeight: 600, color: online ? '#047857' : '#9f1239' }}>
            {online ? t('backOnline') : t('waitingForInternet')}
          </p>
        )}
      </div>
    </div>
  );
}

// The buttons that replace Place order. The first is the way forward for this kind of
// problem; "Show my order to staff" is offered where there are staff to show (onShowStaff).
export function CheckoutProblemActions({ problem, t, primaryColor, busy, onRetry, onChangeOrder, onSendAnyway, onShowStaff }) {
  if (!problem) return null;
  const primary = problem.kind === 'earlier'
    ? { label: t('sendThisOrder'), onClick: onSendAnyway }
    : problem.kind === 'rejected'
      ? { label: t('changeMyOrder'), onClick: onChangeOrder }
      : { label: t('tryAgain'), onClick: onRetry };
  return (
    <div style={{ display: 'grid', gap: 10 }} data-testid="checkout-problem-actions">
      {primary.onClick && (
        <button type="button" onClick={primary.onClick} disabled={busy}
          style={{ ...BUTTON, border: 'none', background: busy ? '#94a3b8' : primaryColor, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? t('placingOrder') : primary.label}
        </button>
      )}
      {onShowStaff && (
        <button type="button" onClick={onShowStaff} disabled={busy}
          style={{ ...BUTTON, border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b' }}>
          {t('showOrderToStaff')}
        </button>
      )}
    </div>
  );
}

// The order, large, for the customer to show a member of staff when it can't be sent.
// maybeSent: the order may already have reached the shop (staff check before taking it).
export function OrderForStaff({ shop, place, lines, total, sym, maybeSent, t, primaryColor, onClose }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={t('myOrder')} data-testid="order-for-staff"
      style={{ position: 'fixed', inset: 0, zIndex: 130, background: '#fff', display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 16px' }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#64748b' }}>{shop}{place ? ` · ${place}` : ''}</p>
        <h2 style={{ margin: '4px 0 16px', fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{t('myOrder')}</h2>
        <div style={{ borderRadius: 14, background: maybeSent ? '#fff7e6' : '#f1f5f9', border: `1px solid ${maybeSent ? '#fde4b0' : '#e2e8f0'}`,
          color: maybeSent ? '#7c4a03' : '#334155', padding: '12px 14px', fontSize: 16, fontWeight: 600, lineHeight: 1.45, marginBottom: 18 }}>
          {maybeSent ? t('forStaffMaybeSent') : t('forStaffNotSent')}
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lines.map((line) => (
            <li key={line.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{line.quantity} × {line.name}</p>
                {line.variant && <p style={{ margin: '2px 0 0', fontSize: 17, color: '#334155' }}>{line.variant}</p>}
                {line.notes && <p style={{ margin: '2px 0 0', fontSize: 17, color: '#334155', fontStyle: 'italic' }}>“{line.notes}”</p>}
              </div>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{sym}{(line.price * line.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
          <span>{t('total')}</span>
          <span style={{ color: primaryColor }}>{sym}{total.toFixed(2)}</span>
        </div>
      </div>
      <div style={{ padding: '12px 20px 20px', borderTop: '1px solid #f1f5f9' }}>
        <button type="button" onClick={onClose}
          style={{ ...BUTTON, border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b' }}>
          {t('back')}
        </button>
      </div>
    </div>
  );
}
