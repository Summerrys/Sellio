import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bike, Check, CheckCircle2, Copy, Loader2, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { courierLinkUrl, makeCourierLink, stopCourierLink } from '@/lib/handover';
import { whatsAppLink } from '@/lib/referral';
import { outsideLinkProps } from '@/lib/nativeApp';
import { useBackToClose } from '@/lib/useBackToClose';
import { blockedOffline, showError } from '@/lib/plainError';
import { formatAppDate } from '@/lib/appDates';
import { useAppText, N_ } from '@/lib/appText';
import { handoverVerified } from './HandoverSheet';

// Orders → a delivery order → Courier link (Alvin, 23 Nov 2026): for a delivery the seller isn't
// at, they send the courier they arranged a link. At the door the courier opens it (no Sellio
// account) and scans the buyer's QR, or types the buyer's code; that marks the order delivered,
// recorded as the courier's scan (pages/CourierHandover.jsx). The link opens this one order, once,
// for 24 hours; a new link replaces the last; once the order is handed over it stops working.
// info: the order's row from shop_handovers (lib/handover.js), refreshed by the page.

const REASONS = {
  no_qr: N_('This order has no QR.'),
  already_completed: N_('Order #{number} is already completed.'),
  cancelled: N_('Order #{number} was cancelled.'),
};
const clock = (iso) => formatAppDate(new Date(iso), 'MMM d, h:mm a');

export default function CourierLinkSheet({ tenantId, order, info, shopName, onChanged, onClose }) {
  const { t } = useAppText();
  // A link made here ({ link, courier_name, expires_at }) or stopped here (null), shown until the
  // page's own info has caught up with it; undefined: the page's info as it is.
  const [override, setOverride] = useState(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [copied, setCopied] = useState(false);

  // The link that works now (none once it was stopped, ran out or the order was handed over).
  const fromInfo = info?.courier_link
    ? { link: info.courier_link, courier_name: info.courier_name, expires_at: info.courier_link_expires_at }
    : null;
  const live = override !== undefined ? override : fromInfo;
  useEffect(() => {
    if (override === undefined) return;
    if ((override === null && !info?.courier_link) || (override && info?.courier_link === override.link)) setOverride(undefined);
  }, [info, override]);
  const delivered = !!info?.verified_at;
  const url = live?.link ? courierLinkUrl(live.link) : '';
  const number = order?.order_number || '';
  const message = url
    ? (shopName
      ? t('Delivery for order #{number} from {shop}. At the door, open this link and scan the QR in the buyer’s Sellio order: {link}', { number, shop: shopName, link: url })
      : t('Delivery for order #{number}. At the door, open this link and scan the QR in the buyer’s Sellio order: {link}', { number, link: url }))
    : '';

  useBackToClose(true, () => { if (busy) return false; onClose(); return undefined; });

  const run = async (request, failed) => {
    if (busy) return;
    if (blockedOffline(failed, t('A courier link needs the internet.'), t)) return;
    setBusy(true);
    setNote(null);
    try {
      const answer = await request();
      if (answer?.ok) {
        setOverride(answer.stopped ? null : { link: answer.link, courier_name: answer.courier_name, expires_at: answer.expires_at });
        if (answer.stopped) setNote({ kind: 'info', text: t('Link stopped. The courier can’t use it any more.') });
        onChanged?.();
      } else {
        setNote({ kind: 'error', text: t(REASONS[answer?.reason] || N_('Couldn’t make the link'), { number }) });
      }
    } catch (error) {
      showError(error, failed, { t });
    } finally {
      setBusy(false);
    }
  };
  const make = () => run(() => makeCourierLink(tenantId, order.id, name.trim()), t('Couldn’t make the link'));
  const remake = () => {
    if (!window.confirm(t('Make a new link? The one you sent stops working.'))) return;
    run(() => makeCourierLink(tenantId, order.id, live?.courier_name || name.trim()), t('Couldn’t make the link'));
  };
  const stop = () => {
    if (!window.confirm(t('Stop this link? The courier won’t be able to use it.'))) return;
    run(() => stopCourierLink(tenantId, order.id), t('Couldn’t stop the link'));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('Couldn’t copy. Press and hold the link to copy it.'));
    }
  };

  const title = t('Courier link');
  const button = 'h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 disabled:opacity-40';

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
        data-testid="courier-sheet"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{t('Order #{number}', { number })}</p>
          </div>
          <button type="button" onClick={() => { if (!busy) onClose(); }} aria-label={t('Close')} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {delivered ? (
            <div data-testid="courier-delivered" className="text-center space-y-2 py-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <p className="text-xl font-extrabold text-slate-900">{t('Delivered')}</p>
              <p className="text-sm text-slate-500">
                {t(handoverVerified(info.verified_via))} · {clock(info.verified_at)}
                {info.verified_by_courier && ` · ${info.verified_by_name ? t('Courier ({name})', { name: info.verified_by_name }) : t('Courier')}`}
              </p>
              <button type="button" onClick={onClose} className={`${button} w-full mt-3`}>{t('Done')}</button>
            </div>
          ) : (
            <>
              {note && (
                <div
                  role={note.kind === 'error' ? 'alert' : 'status'}
                  className={`rounded-xl px-3 py-2.5 text-sm flex gap-2 ${note.kind === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-800'}`}
                  data-testid="courier-note"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{note.text}</span>
                </div>
              )}

              {live ? (
                <div className="space-y-3" data-testid="courier-live">
                  <p className="text-sm text-slate-600">
                    {t('Send this link to your courier. At the door they open it and scan the QR in the buyer’s Sellio order. That marks the order delivered.')}
                  </p>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                    {live.courier_name && <p className="text-xs font-semibold text-slate-700 mb-1" data-testid="courier-name">{t('For {name}', { name: live.courier_name })}</p>}
                    <p className="text-[13px] font-mono text-slate-900 break-all select-all" data-testid="courier-url">{url}</p>
                    <p className="mt-1.5 text-xs text-slate-500" data-testid="courier-status">
                      {t('Works once, until {when}.', { when: clock(live.expires_at) })}
                      {' '}
                      {info?.courier_link === live.link && info?.courier_opened_at
                        ? t('Opened by the courier {when}.', { when: clock(info.courier_opened_at) })
                        : t('Not opened yet.')}
                    </p>
                  </div>
                  <a
                    {...outsideLinkProps(whatsAppLink(message))}
                    className="h-12 w-full rounded-xl text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2"
                    style={{ background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
                    data-testid="courier-whatsapp"
                  >
                    <MessageCircle className="w-[18px] h-[18px]" />{' '}{t('Send on WhatsApp')}
                  </a>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={copy} className={button} data-testid="courier-copy">
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}{' '}{copied ? t('Copied') : t('Copy link')}
                    </button>
                    <button type="button" onClick={remake} disabled={busy} className={button} data-testid="courier-remake">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{t('New link')}
                    </button>
                  </div>
                  <button type="button" onClick={stop} disabled={busy} className="w-full h-10 text-sm font-semibold text-rose-600" data-testid="courier-stop">
                    {t('Stop link')}
                  </button>
                </div>
              ) : (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); make(); }} data-testid="courier-make-form">
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                      <Bike className="w-5 h-5" />
                    </div>
                    <p className="text-sm text-slate-600">
                      {t('Booked a courier or a runner? Send them a link. At the door they open it and scan the QR in the buyer’s Sellio order, and the order is marked delivered. The link works once, for 24 hours.')}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="courier-name" className="block text-xs font-semibold text-slate-600">{t('Courier’s name (optional)')}</label>
                    <input
                      id="courier-name"
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 60))}
                      maxLength={60}
                      autoComplete="off"
                      placeholder={t('e.g. Ahmad')}
                      className="w-full h-11 rounded-xl border border-slate-200 px-3 text-[15px] text-slate-900"
                      data-testid="courier-name-input"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="h-12 w-full rounded-xl text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
                    data-testid="courier-make"
                  >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('Make link')}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
