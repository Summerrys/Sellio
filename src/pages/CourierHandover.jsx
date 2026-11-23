import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, KeyRound, Link2Off, Loader2, RefreshCw } from 'lucide-react';
import QrScanner from '@/components/handover/QrScanner';
import { handoverVerified, pausedText } from '@/components/handover/HandoverSheet';
import AppLanguageSwitch from '@/components/ui-custom/AppLanguageSwitch';
import { COURIER_LINK, cleanPin, courierPin, courierScan, fetchCourierHandover, tokenFromScan } from '@/lib/handover';
import { formatAppDate } from '@/lib/appDates';
import { useAppText } from '@/lib/appText';

// sellio.sg/courier/<link> (Alvin, 23 Nov 2026): the page a home seller's courier opens from the link
// the seller sent them (Orders → Courier link). No Sellio account: the link opens this one order,
// once, for 24 hours. At the door the courier scans the QR in the buyer's Sellio order (or types the
// buyer's 6-digit code); the server checks it, records the delivery as the courier's scan and marks
// the order delivered, and the link stops working. The page shows only the shop, the order number
// and whether it's a delivery: nothing about the buyer. Not for search engines (App.jsx keeps every
// page but the public ones out).

const clock = (iso) => formatAppDate(new Date(iso), 'MMM d, h:mm a');
const BRAND = 'linear-gradient(90deg, #fb923c, #e0449a 55%, #8b2fc9)';

export default function CourierHandover() {
  const { link: raw } = useParams();
  const link = String(raw || '').trim().toLowerCase();
  const { t } = useAppText();
  const [page, setPage] = useState('loading'); // loading | invalid | error | ready | done
  const [info, setInfo] = useState(null); // { shop_name, order_number, method, courier_name, expires_at, paused_until }
  const [done, setDone] = useState(null); // the server's answer once handed over
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Delivery · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!COURIER_LINK.test(link)) { setPage('invalid'); return undefined; }
    let live = true;
    setPage('loading');
    fetchCourierHandover(link)
      .then((answer) => {
        if (!live) return;
        if (answer?.ok) {
          setInfo(answer);
          setPage('ready');
          if (answer.paused_until) setNote(pausedText(t, answer.paused_until));
        } else {
          setPage('invalid');
        }
      })
      .catch(() => { if (live) setPage('error'); });
    return () => { live = false; };
  }, [link, attempt]);

  const number = info?.order_number || '';
  const take = (answer) => {
    if (answer?.ok) {
      setDone(answer);
      setPage('done');
      setNote(null);
      return;
    }
    const reason = answer?.reason;
    if (reason === 'invalid') { setPage('invalid'); return; }
    if (reason === 'not_this_order') setNote(t('That QR is for a different order. Ask the buyer to open order #{number} in Sellio.', { number }));
    else if (reason === 'wrong_pin') setNote(t('That code is wrong. {count} more tries, then a 5-minute wait.', { count: answer.tries_left }));
    else if (reason === 'paused') setNote(pausedText(t, answer.paused_until));
    else if (reason === 'cancelled') setNote(t('Order #{number} was cancelled. Don’t hand it over: check with the seller.', { number }));
    else if (reason === 'already' || reason === 'already_completed') setNote(t('Order #{number} was already handed over.', { number }));
    else setNote(t('Couldn’t check the QR'));
  };
  const send = async (request) => {
    if (busy) return;
    setBusy(true);
    try {
      take(await request());
    } catch {
      setNote(t('Couldn’t check the QR. Check the internet and try again.'));
    } finally {
      setBusy(false);
    }
  };
  const onScan = (text) => {
    if (busy || page !== 'ready') return;
    const token = tokenFromScan(text);
    if (!token) { setNote(t('That isn’t a Sellio QR.')); return; }
    send(() => courierScan(link, token));
  };

  const delivery = (done?.method || info?.method) !== 'collection';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900" data-testid="courier-page">
      <div className="mx-auto max-w-md px-4 pt-4 pb-10 space-y-4">
        <header className="flex items-center justify-between">
          <span className="text-xl font-extrabold bg-clip-text text-transparent" style={{ backgroundImage: BRAND }}>Sellio</span>
          <AppLanguageSwitch />
        </header>

        {page === 'loading' && (
          <div className="py-24 flex justify-center text-slate-400" data-testid="courier-loading">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        )}

        {page === 'invalid' && (
          <section className="rounded-2xl bg-white border border-slate-100 p-6 text-center space-y-2" data-testid="courier-invalid">
            <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
              <Link2Off className="w-7 h-7" />
            </div>
            <p className="text-lg font-bold">{t('This link has expired or was already used.')}</p>
            <p className="text-sm text-slate-600">{t('Ask the seller for a new one.')}</p>
          </section>
        )}

        {page === 'error' && (
          <section className="rounded-2xl bg-white border border-slate-100 p-6 text-center space-y-3" data-testid="courier-error">
            <p className="text-sm text-slate-700">{t('Couldn’t open the delivery. Check the internet and try again.')}</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-10 px-4 rounded-full bg-slate-900 text-white text-sm font-semibold inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" />{' '}{t('Try again')}
            </button>
          </section>
        )}

        {page === 'done' && done && (
          <section className="rounded-2xl bg-white border border-slate-100 p-6 text-center space-y-2" data-testid="courier-done">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <p className="text-2xl font-extrabold">{delivery ? t('Delivered') : t('Collected')}</p>
            <p className="text-sm text-slate-600">{t('Order #{number}', { number: done.order_number || number })}</p>
            <p className="text-sm text-slate-500">{t(handoverVerified(done.verified_via))} · {clock(done.verified_at)}</p>
            <p className="pt-2 text-sm text-slate-600">{t('Thank you! You can close this page.')}</p>
          </section>
        )}

        {page === 'ready' && info && (
          <>
            <section className="rounded-2xl bg-white border border-slate-100 p-4" data-testid="courier-order">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{delivery ? t('Delivery') : t('Collection')}</p>
              <p className="mt-0.5 text-xl font-extrabold">{t('Order #{number}', { number })}</p>
              {info.shop_name && <p className="text-sm text-slate-600">{t('From {shop}', { shop: info.shop_name })}</p>}
            </section>

            <p className="text-sm text-slate-700">
              {t('At the door, ask the buyer to open this order in Sellio and show its QR. Scan it here: that confirms the delivery.')}
            </p>

            {note && (
              <div role="alert" className="rounded-xl px-3 py-2.5 text-sm flex gap-2 bg-rose-50 text-rose-800" data-testid="courier-page-note">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{note}</span>
              </div>
            )}

            <QrScanner onResult={onScan} paused={busy} />

            <form
              className="space-y-2"
              onSubmit={(e) => { e.preventDefault(); if (pin.length === 6) send(() => courierPin(link, pin)); }}
              data-testid="courier-pin-form"
            >
              <label htmlFor="courier-pin" className="block text-xs font-semibold text-slate-600">{t('Or type the buyer’s 6-digit code')}</label>
              <div className="flex gap-2">
                <input
                  id="courier-pin"
                  value={pin}
                  onChange={(e) => setPin(cleanPin(e.target.value))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="flex-1 min-w-0 h-11 rounded-xl border border-slate-200 bg-white px-3 text-lg tracking-[0.3em] font-semibold"
                  data-testid="courier-pin"
                />
                <button type="submit" disabled={busy || pin.length !== 6} className="h-11 px-4 flex-shrink-0 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}{' '}{t('Check')}
                </button>
              </div>
            </form>

            <p className="text-xs text-slate-500 text-center" data-testid="courier-expiry">
              {t('This link works once, until {when}.', { when: clock(info.expires_at) })}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
