import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, X } from 'lucide-react';
import QrScanner from './QrScanner';
import { cleanPin, handoverMethod, pinHandover, scanHandover, tokenFromScan } from '@/lib/handover';
import { useBackToClose } from '@/lib/useBackToClose';
import { blockedOffline, showError } from '@/lib/plainError';
import { formatAppDate } from '@/lib/appDates';
import { useAppText, N_ } from '@/lib/appText';

// Orders → Scan buyer's QR (Alvin, 23 Nov 2026): the seller scans the QR on the buyer's phone; the
// server checks it, records the handover (when, by whom) and marks the order collected / delivered,
// all in one go (lib/handover.js). Then this shows what to hand over. If the camera can't read the
// QR, the buyer's 6-digit code can be typed for the order it was opened from. There is no way round
// the QR or the code: an order whose buyer has one is handed over only like this.
// Opened from an order's card (startOrder), from "Scan QR" at the top of Orders, or from a
// sellio.sg/Orders?qr= link a phone's camera app opened (startToken). Every 5th wrong code makes the
// code wait 5 minutes (the server's rule); the QR always works.

const REASONS = {
  unknown: N_('This QR isn’t one of your orders’. Ask the buyer to open the order in Sellio and show its QR.'),
  other_shop: N_('This QR is for an order from another shop.'),
  cancelled: N_('Order #{number} was cancelled.'),
  already_completed: N_('Order #{number} is already completed.'),
  no_qr: N_('This order has no QR.'),
};
const USED = {
  collection: N_('Already used: order #{number} was collected {when}.'),
  delivery: N_('Already used: order #{number} was delivered {when}.'),
};
const VERIFIED = {
  qr: N_('Verified by QR scan'),
  pin: N_('Verified with the buyer’s code'),
};
export const handoverVerified = (via) => VERIFIED[via] || null;
const clock = (iso) => formatAppDate(new Date(iso), 'MMM d, h:mm a');
// Too many wrong codes: when the code can be tried again (the shop's view or the server's answer).
export const pausedText = (t, until) => t('Too many wrong codes. Try the code again after {time}, or scan the buyer’s QR.', { time: formatAppDate(new Date(until), 'h:mm a') });
const stillPaused = (until) => !!until && new Date(until).getTime() > Date.now();
const itemLines = (items) => (items || []).map((i) => `${Number(i.quantity) || 1}× ${i.name || i.product_name || ''}${i.variant ? ` (${i.variant})` : ''}`);

export default function HandoverSheet({ tenantId, orders, handovers, startOrder = null, startToken = null, onDone, onClose }) {
  const { t } = useAppText();
  const [orderId, setOrderId] = useState(startOrder?.id || null);
  const [done, setDone] = useState(null); // the server's answer for a handover just recorded
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'error' | 'info', text }

  const order = useMemo(() => (orders || []).find((o) => o.id === orderId) || null, [orders, orderId]);
  const info = orderId ? handovers?.[orderId] || null : null;
  // handovers is null until loaded: the code can be typed meanwhile (the server says).
  const canType = !!orderId && (handovers ? !!info?.has_qr : true);
  const pausedUntil = orderId && stillPaused(info?.pin_paused_until) ? info.pin_paused_until : null;

  useBackToClose(true, () => { if (busy) return false; onClose(); return undefined; });

  const take = (answer) => {
    if (answer?.ok) {
      setDone(answer);
      setNote(null);
      setPin('');
      onDone?.(answer);
      return;
    }
    const number = answer?.order_number || order?.order_number || '';
    if (answer?.reason === 'already') {
      const used = USED[answer.method] || USED.collection;
      const by = answer.verified_by_name ? ` (${answer.verified_by_name})` : '';
      setNote({ kind: 'error', text: `${t(used, { number, when: clock(answer.verified_at) })}${by}` });
    } else if (answer?.reason === 'wrong_pin') {
      setNote({ kind: 'error', text: t('That code is wrong. {count} more tries, then a 5-minute wait.', { count: answer.tries_left }) });
    } else if (answer?.reason === 'paused') {
      setNote({ kind: 'error', text: pausedText(t, answer.paused_until) });
    } else {
      setNote({ kind: 'error', text: t(REASONS[answer?.reason] || N_('Couldn’t check the QR'), { number }) });
    }
  };

  const send = async (request) => {
    if (busy) return;
    if (blockedOffline(t('Couldn’t check the QR'), t('Checking a QR needs the internet.'), t)) return;
    setBusy(true);
    try {
      take(await request());
    } catch (error) {
      showError(error, t('Couldn’t check the QR'), { t });
    } finally {
      setBusy(false);
    }
  };

  const onScan = (text) => {
    if (busy || done) return;
    const token = tokenFromScan(text);
    if (!token) { setNote({ kind: 'error', text: t('That isn’t a Sellio QR.') }); return; }
    send(() => scanHandover(tenantId, token));
  };

  // Opened from a sellio.sg/Orders?qr= link: that QR straight away.
  useEffect(() => {
    if (startToken) send(() => scanHandover(tenantId, tokenFromScan(startToken) || startToken));
  }, []);

  const scanNext = () => { setDone(null); setOrderId(null); setNote(null); setPin(''); };
  const title = done
    ? t('Order #{number}', { number: done.order_number })
    : order ? t('Order #{number}', { number: order.order_number }) : t('Scan buyer’s QR');

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 520, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.6)' }}
      onClick={() => { if (!busy) onClose(); }}
      data-pull-refresh-block
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white w-full max-w-lg mx-auto flex flex-col"
        style={{ borderRadius: '20px 20px 0 0', maxHeight: '94vh', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
        data-testid="handover-sheet"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          <p className="text-[15px] font-bold text-slate-900">{title}</p>
          <button type="button" onClick={() => { if (!busy) onClose(); }} aria-label={t('Close')} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {done ? (
            <div data-testid="handover-done" className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div>
                <p className="text-xl font-extrabold text-slate-900">{handoverMethod({ fulfilment: { method: done.method } }) === 'delivery' ? t('Delivered') : t('Collected')}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {t(handoverVerified(done.verified_via))} · {clock(done.verified_at)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-left">
                <p className="text-sm font-semibold text-slate-900">
                  {done.customer_name && done.customer_name.toLowerCase() !== 'nil' ? done.customer_name : t('Buyer')}
                </p>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Hand over')}</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700" data-testid="handover-items">
                  {itemLines(done.items).map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onClick={onClose} className="h-12 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold">{t('Done')}</button>
                <button
                  type="button"
                  onClick={scanNext}
                  data-testid="handover-scan-next"
                  className="h-12 rounded-xl text-white text-sm font-bold"
                  style={{ background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
                >
                  {t('Scan next')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {order && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm" data-testid="handover-order">
                  <p className="font-semibold text-slate-900 truncate">
                    {order.customer_name && order.customer_name.toLowerCase() !== 'nil' ? order.customer_name : t('Buyer')}
                  </p>
                  {order.items?.length > 0 && <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{itemLines(order.items).join(', ')}</p>}
                </div>
              )}

              {note && (
                <div
                  role={note.kind === 'error' ? 'alert' : 'status'}
                  className={`rounded-xl px-3 py-2.5 text-sm flex gap-2 ${note.kind === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-800'}`}
                  data-testid="handover-note"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{note.text}</span>
                </div>
              )}

              <QrScanner onResult={onScan} paused={busy} />
              <p className="text-xs text-slate-500 text-center">{t('Point the camera at the QR on the buyer’s phone.')}</p>

              {canType && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => { e.preventDefault(); if (pin.length === 6) send(() => pinHandover(tenantId, orderId, pin)); }}
                  data-testid="handover-pin-form"
                >
                  <label htmlFor="handover-pin" className="block text-xs font-semibold text-slate-600">{t('Or type the buyer’s 6-digit code')}</label>
                  <div className="flex gap-2">
                    <input
                      id="handover-pin"
                      value={pin}
                      onChange={(e) => setPin(cleanPin(e.target.value))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      className="flex-1 min-w-0 h-11 rounded-xl border border-slate-200 px-3 text-lg tracking-[0.3em] font-semibold text-slate-900"
                      data-testid="handover-pin"
                    />
                    <button type="submit" disabled={busy || pin.length !== 6} className="h-11 px-4 flex-shrink-0 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}{' '}{t('Check')}
                    </button>
                  </div>
                </form>
              )}
              {pausedUntil && !note && <p className="text-xs text-amber-700" data-testid="handover-paused">{pausedText(t, pausedUntil)}</p>}
              {!orderId && <p className="text-xs text-slate-500 text-center">{t('To type a 6-digit code instead, tap Scan QR on the order.')}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
