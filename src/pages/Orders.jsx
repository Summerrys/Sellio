import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { loadPrinterConfig, buildOrderReceipt, buildOrderChit, buildTableReceipt, sendViaBluetooth, sendViaEpsonEPos } from '@/lib/printerUtils';
import { usePrintWords, readyPrintWords, ENGLISH_PRINT } from '@/lib/printWords';
import { loadTableBillForOrder, paymentText, tableReceiptHtml } from '@/lib/tableBill';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import { isFnBIndustry } from '@/lib/industry';
import { useAppUser } from '@/lib/AppUserContext';
import RequirePermission from '../components/auth/RequirePermission';
import { useAppRefreshHandler } from '@/lib/AppRefreshContext';
import { useSyncExternalStore } from 'react';
import { getPendingCheckouts, subscribePendingCheckouts } from '@/lib/mobileCheckout';
import TableCallAlerts from '../components/orders/TableCallAlerts';
import { useOrderAlerts, REMIND_EVERY } from '@/lib/useOrderAlerts';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, BellOff, Monitor, Search, Download, Printer, Loader2, QrCode, ScanLine, CheckCircle2, Bike, Camera } from 'lucide-react';
import EditOrderModal from '@/components/orders/EditOrderModal';
import ChitPreviewSheet from '@/components/orders/ChitPreviewSheet';
import { SkeletonList } from '@/components/ui-custom/AppLoader';
import LoadingShapes from '@/components/ui-custom/LoadingShapes';
import OrdersEmpty, { ordersEmptyKind } from '@/components/orders/OrdersEmpty';
import { didYouMean } from '@/lib/searchSuggest';
import { useProductTour } from '@/hooks/useProductTour';
import TourGuide from '@/components/tour/TourGuide';
import { getOrdersSteps } from '@/components/tour/tourSteps';
import DummyOrderCard from '@/components/tour/DummyOrderCard';
import { toast } from 'sonner';
import { blockedOffline, showError } from '@/lib/plainError';
import { createPageUrl } from '../utils';
import { useLocation, useNavigate } from 'react-router-dom';
import { appTimeAgo, formatAppDate } from '@/lib/appDates';
import ShopOrderInfo, { ShopMethodBadge } from '@/components/shop/ShopOrderInfo';
import { isShopTenant, shopMethod, shopNextAction, shopStatusLabel, shopStatusTabs } from '@/lib/shopSelling';
import { inAppFiles, saveFileInApp } from '@/lib/appFiles';
import { useBackToClose } from '@/lib/useBackToClose';
import { useOnline } from '@/lib/network';
import { keepSnapshot, loadSnapshot } from '@/lib/offlineStore';
import OfflineNote, { listNoteWords } from '@/components/ui-custom/OfflineNote';
import { currencyDecimals, formatMoney } from '@/lib/money';
import { paymentQrName } from '@/lib/countries';
import { useAppText, appT, N_ } from '@/lib/appText';
import HandoverSheet, { handoverVerified } from '@/components/handover/HandoverSheet';
import CourierLinkSheet from '@/components/handover/CourierLinkSheet';
import PackingPhotoSheet from '@/components/handover/PackingPhotoSheet';
import { PackingPhotoViewer } from '@/components/handover/PackingPhotoView';
import { fetchShopHandovers } from '@/lib/handover';
import { PACKING_REQUIRED, fetchShopPackingPhotos, photoLinks } from '@/lib/packingPhoto';

// The latest orders kept on the phone, for opening Orders with no connection (UX states, 4).
const KEPT_ORDERS = 100;

const STATUS_TABS = [
  { value: 'all',       label: N_('All') },
  { value: 'pending',   label: N_('New') },
  { value: 'confirmed', label: N_('Confirmed') },
  { value: 'preparing', label: N_('Preparing') },
  { value: 'ready',     label: N_('Ready') },
  { value: 'completed', label: N_('Done') },
];

const STATUS_ACCENT = {
  pending:   { border: '#f59e0b', bg: '#fffbeb' },
  confirmed: { border: '#3b82f6', bg: '#eff6ff' },
  preparing: { border: '#8b5cf6', bg: '#f5f3ff' },
  ready:     { border: '#10b981', bg: '#ecfdf5' },
  completed: { border: '#94a3b8', bg: '#f8fafc' },
  cancelled: { border: '#ef4444', bg: '#fef2f2' },
};

const STATUS_NEXT = {
  pending:   { label: N_('Accept'),          next: 'confirmed' },
  confirmed: { label: N_('Start Preparing'), next: 'preparing' },
  preparing: { label: N_('Mark Ready'),      next: 'ready' },
  ready:     { label: N_('Mark Served'),     next: 'completed' },
};

// Buttons that use theme color vs neutral
const THEME_BUTTON_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);


function printReceipt(order, currency, merchantName, words = ENGLISH_PRINT) {
  const { t } = words;
  const itemsHtml = (order.items || []).map(item => {
    const lineTotal = (item.price || item.unit_price || 0) * (item.quantity || 1);
    return `<tr>
      <td style="padding:4px 8px 4px 0">${item.quantity}× ${item.name || item.product_name}${item.variant ? ` (${item.variant})` : ''}</td>
      <td style="padding:4px 0;text-align:right">${formatMoney(lineTotal, currency)}</td>
    </tr>`;
  }).join('');
  const subtotal = formatMoney(parseFloat(order.subtotal || order.total_amount || 0), currency);
  const tax = formatMoney(parseFloat(order.tax_amount || 0), currency);
  const total = formatMoney(parseFloat(order.total_amount || 0), currency);
  const date = new Date(order.created_date || Date.now()).toLocaleString(words.locale);

  const win = window.open('', '_blank', 'width=400,height=600');
  win.document.write(`<!DOCTYPE html><html lang="${words.locale === 'id-ID' ? 'id' : 'en'}"><head><title>${t('Receipt')}</title>
  <style>
    body{font-family:monospace;font-size:13px;margin:0;padding:16px;max-width:320px}
    h2{margin:0 0 4px;font-size:16px;text-align:center}
    .center{text-align:center} .divider{border-top:1px dashed #000;margin:8px 0}
    table{width:100%;border-collapse:collapse} td{vertical-align:top}
    .total{font-weight:bold;font-size:14px} .small{font-size:11px;color:#555}
    @media print{body{padding:0}button{display:none}}
  </style></head><body>
  <h2>${merchantName || t('Receipt')}</h2>
  <p class="center small">${date}</p>
  <div class="divider"></div>
  <p><strong>${t('Order:')}</strong> ${order.order_number || order.id?.slice(-6)}</p>
  ${order.table_name ? `<p><strong>${t('Table:')}</strong> ${order.table_name}</p>` : ''}
  ${order.customer_name && order.customer_name.toLowerCase() !== 'nil' ? `<p><strong>${t('Customer:')}</strong> ${order.customer_name}</p>` : ''}
  <div class="divider"></div>
  <table>${itemsHtml}</table>
  <div class="divider"></div>
  <table>
    <tr><td>${t('Subtotal')}</td><td style="text-align:right">${subtotal}</td></tr>
    <tr><td>${t('Tax')}</td><td style="text-align:right">${tax}</td></tr>
    <tr class="total"><td>${t('Total')}</td><td style="text-align:right">${total}</td></tr>
  </table>
  <div class="divider"></div>
  <p class="center small">${t('Thank you for your visit!')}</p>
  <p class="center small" style="color:#94a3b8">${t('Powered by Sellio')}</p>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  win.document.close();
}

// Browser print of a whole table bill, for shops without a receipt printer.
function printTableReceipt(bill, currency, merchantName, words = ENGLISH_PRINT) {
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) { toast.error(appT('Allow pop-ups to print, or connect a receipt printer in Settings.')); return; }
  win.document.write(tableReceiptHtml(bill, currency, merchantName, words));
  win.document.close();
}

function OrderCard({ order, currency, merchantName, paymentQrUrl, paymentQrLabel, tenantId, onStatusUpdate, onMarkPaid, onOrderUpdated, onHandover, onCourierLink, onPackingPhoto, handover = null, packing = null, packingUrl = null, tourTag = false }) {
  const { t } = useAppText();
  const { hasPermission, tenant, canUseFeature } = useTenant();
  // A receipt and a chit are in the shop's language (printWords.js), and so are their previews.
  const printed = usePrintWords(tenant);
  const pt = printed.t;
  const canPrintReceipts = !canUseFeature || canUseFeature('can_print');
  const canEditOrders = hasPermission('orders.edit');
  const canCancelOrders = hasPermission('orders.cancel');
  const canPrintChit = hasPermission('orders.print_chit');
  const [showEditOrder, setShowEditOrder] = useState(false);
  const [showPaymentQR, setShowPaymentQR] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [tableBill, setTableBill] = useState(null);
  const isFinal = order.status === 'completed' || order.status === 'cancelled';
  // Free shops (step 15): steps and words for collection or delivery.
  const isShop = isShopTenant(tenant);
  const shopFood = isFnBIndustry(tenant?.industry);
  const action = isShop ? shopNextAction(order.status, shopMethod(order), shopFood) : STATUS_NEXT[order.status];
  // A home seller's order whose buyer has a QR is collected / delivered only by scanning it
  // (lib/handover.js): its last step opens the scanner instead of marking it done; there is no
  // Mark collected / delivered. A delivery can also be handed to a courier with a one-time link.
  const qrOpen = isShop && !!handover?.has_qr && !handover.verified_at && !isFinal;
  const scansQr = qrOpen && action?.next === 'completed' && !!onHandover;
  // Such an order is marked packed (ready / out for delivery) only with a photo of it packed, its
  // order number in the picture (lib/packingPhoto.js): its "Ready for collection" / "Out for
  // delivery" opens Sellio's camera instead. The buyer sees the photo.
  const takesPhoto = qrOpen && action?.next === 'ready' && order.status === 'preparing' && !packing && !!onPackingPhoto;
  // A courier link once it's packed (the courier's scan needs the order packed first).
  const courierLink = qrOpen && order.status === 'ready' && shopMethod(order) === 'delivery' && canEditOrders && !!onCourierLink;
  const [viewPhoto, setViewPhoto] = useState(false);
  const accent = STATUS_ACCENT[order.status] || STATUS_ACCENT.completed;
  const elapsed = appTimeAgo(new Date(order.created_date || order.created_at));
  const customerName = order.customer_name && order.customer_name.toLowerCase() !== 'nil' ? order.customer_name : null;
  const useThemeButton = THEME_BUTTON_STATUSES.has(order.status);
  const showPrint = order.status === 'ready' || order.status === 'completed';
  const [printing, setPrinting] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptPrinting, setReceiptPrinting] = useState(false);
  const [receiptBill, setReceiptBill] = useState(null);
  const [receiptBillState, setReceiptBillState] = useState('idle');
  const [chitPrinting, setChitPrinting] = useState(false);
  const [showChit, setShowChit] = useState(false);
  // Phone / browser Back closes these sheets first; while a payment or print is still
  // going through, Back waits rather than closing it.
  useBackToClose(showEditOrder, () => setShowEditOrder(false));
  useBackToClose(showReceipt, () => { if (receiptPrinting) return false; setShowReceipt(false); });
  useBackToClose(showChit, () => { if (chitPrinting) return false; setShowChit(false); });
  useBackToClose(showPaymentQR, () => { if (payBusy) return false; setShowPaymentQR(false); });
  const packedWhen = packing?.taken_at ? formatAppDate(new Date(packing.taken_at), 'MMM d, h:mm a') : '';
  // The shop's own country's QR: PayNow, DuitNow or QRIS (lib/countries.js).
  const qrPayLabel = `QR · ${paymentQrName(tenant)}`;

  useEffect(() => {
    if (!showPaymentQR || !order.table_id) { setTableBill(null); return undefined; }
    let live = true;
    (async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('table_sessions')
        .select('total_amount, order_ids')
        .eq('tenant_id', tenantId).eq('table_id', order.table_id).eq('status', 'active')
        .limit(1).maybeSingle();
      const ids = Array.isArray(data?.order_ids) ? data.order_ids : [];
      if (live) setTableBill(data && ids.includes(order.id) ? { total: Number(data.total_amount) || 0 } : null);
    })().catch(() => { if (live) setTableBill(null); });
    return () => { live = false; };
  }, [showPaymentQR, order.table_id, order.id, tenantId]);

  // One receipt per table: a table order's receipt is the whole table bill (every round).
  useEffect(() => {
    if (!showReceipt || !order.table_id) { setReceiptBill(null); setReceiptBillState('idle'); return undefined; }
    let live = true;
    setReceiptBillState('loading');
    (async () => {
      const next = await loadTableBillForOrder(await getSupabase(), tenantId, order);
      if (live) { setReceiptBill(next); setReceiptBillState(next ? 'ready' : 'none'); }
    })().catch(() => { if (live) { setReceiptBill(null); setReceiptBillState('failed'); } });
    return () => { live = false; };
  }, [showReceipt, order.id, order.table_id, tenantId]);

  const pay = async (method) => {
    if (payBusy) return;
    setPayBusy(true);
    try {
      if (await onMarkPaid(order, isShop, method)) setShowPaymentQR(false);
    } finally {
      setPayBusy(false);
    }
  };

  const handlePrintChit = async (e) => {
    e?.stopPropagation();
    const cfg = loadPrinterConfig(tenantId);
    if (!cfg) {
      toast.error(t('No printer connected — set one up in Settings → Printer'));
      return;
    }
    setChitPrinting(true);
    const bytes = buildOrderChit(order, merchantName, tenant?.receipt_paper_size, await readyPrintWords(tenant, printed));
    try {
      if (cfg.mode === 'bluetooth' && cfg.deviceName) {
        await sendViaBluetooth(cfg.deviceName, bytes, cfg.deviceId);
      } else if (cfg.mode === 'network') {
        await sendViaEpsonEPos(cfg.ip, bytes, merchantName);
      } else {
        toast.error(t('No printer connected — set one up in Settings → Printer'));
        return;
      }
      toast.success(t('Chit printed ✓'));
      setShowChit(false);
    } catch (err) {
      toast.error(t('Print failed: {message}', { message: err.message }));
    } finally {
      setChitPrinting(false);
    }
  };

  const handleActualPrint = async () => {
    if (receiptBillState === 'loading') return;
    const cfg = loadPrinterConfig(tenantId);
    // A pop-up opens only straight from the tap, so the browser print takes the words already loaded.
    const browserPrint = () => (receiptBill ? printTableReceipt(receiptBill, currency, merchantName, printed) : printReceipt(order, currency, merchantName, printed));
    if (!cfg) {
      browserPrint();
      setShowReceipt(false);
      return;
    }
    setReceiptPrinting(true);
    const words = await readyPrintWords(tenant, printed);
    const bytes = receiptBill
      ? buildTableReceipt(receiptBill, currency, merchantName, tenant?.receipt_paper_size, words)
      : buildOrderReceipt(order, currency, merchantName, tenant?.receipt_paper_size, words);
    try {
      if (cfg.mode === 'bluetooth' && cfg.deviceName) {
        await sendViaBluetooth(cfg.deviceName, bytes, cfg.deviceId);
      } else if (cfg.mode === 'network') {
        await sendViaEpsonEPos(cfg.ip, bytes, merchantName);
      } else {
        browserPrint();
      }
      toast.success(t('Printed ✓'));
      setShowReceipt(false);
    } catch (err) {
      toast.error(t('Print failed: {message}', { message: err.message }));
    } finally {
      setReceiptPrinting(false);
    }
  };

  return (
    <>
      <div
        data-sellio-order-card
        {...(tourTag ? { 'data-tour': 'order-card' } : {})}
        onClick={() => { if (canEditOrders && !isFinal) setShowEditOrder(true); }}
        className={`rounded-xl border border-slate-200 overflow-hidden shadow-sm ${canEditOrders && !isFinal ? 'cursor-pointer active:opacity-90 transition-opacity' : ''}`}
        style={{ borderLeft: `4px solid ${accent.border}`, background: accent.bg }}
      >
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-sm">#{order.order_number || order.id?.slice(-6)}</span>
              {isShop && <ShopMethodBadge order={order} />}
              {isShop && order.payment_status === 'paid' && (
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{t('Paid')}</span>
              )}
              {!isShop && order.table_name && (
                <span className="text-xs bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                  🪑 {order.table_name}
                </span>
              )}
              {order.order_type && (
                <span className="text-xs text-slate-500">
                  {order.order_type === 'dine_in' ? t('Dine In') : order.order_type === 'takeaway' ? t('Takeaway') : order.order_type}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-slate-400">{elapsed}</span>
            </div>
          </div>

          {/* Customer */}
          {isShop ? (
            <ShopOrderInfo order={order} currency={currency} shopName={merchantName} />
          ) : customerName && (
            <p className="text-xs text-slate-500 mb-2">{customerName}</p>
          )}

          {/* Items */}
          <div className="space-y-1 mb-3">
            {(order.items || []).map((item, idx) => (
              <div key={idx} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-800 font-medium">
                    {item.quantity}× {item.name || item.product_name}
                    {item.variant ? <span className="text-slate-500 font-normal"> ({item.variant})</span> : ''}
                  </span>
                  {item.price != null && (
                    <span className="text-slate-500 text-xs">{formatMoney((item.price || 0) * (item.quantity || 1), currency)}</span>
                  )}
                </div>
                {item.notes && (
                  <p className="text-xs text-slate-500 italic pl-4">📝 {item.notes}</p>
                )}
              </div>
            ))}
          </div>

          {/* Notes */}
          {order.notes && (
            <p className="text-xs text-slate-500 italic mb-2">📝 {order.notes}</p>
          )}

          {/* Total */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-900">{formatMoney(parseFloat(order.total_amount || 0), currency)}</span>
            {order.status === 'completed' && (
              <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">✓ {isShop ? t(shopStatusLabel('completed', shopMethod(order), shopFood)) : t('Completed')}</span>
            )}
            {isShop && order.status === 'cancelled' && (
              <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{t('Cancelled')}</span>
            )}
          </div>
          {isShop && handover?.verified_at && (
            <p data-testid="handover-record" className="-mt-1.5 mb-3 text-xs flex items-start gap-1 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span>
                {t(handoverVerified(handover.verified_via))}
                {' · '}{formatAppDate(new Date(handover.verified_at), 'MMM d, h:mm a')}
                {handover.verified_by_courier
                  ? ` · ${handover.verified_by_name ? t('Courier ({name})', { name: handover.verified_by_name }) : t('Courier')}`
                  : (handover.verified_by_name ? ` · ${handover.verified_by_name}` : '')}
              </span>
            </p>
          )}
          {isShop && packing && (
            <div data-testid="packing-record" className="-mt-1 mb-3 flex items-center gap-2.5">
              {packingUrl ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setViewPhoto(true); }}
                  aria-label={t('Open the packing photo of order #{number}', { number: order.order_number })}
                  className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0"
                  data-testid="packing-thumb"
                >
                  <img src={packingUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ) : (
                <span className="w-12 h-12 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0"><Camera className="w-5 h-5" /></span>
              )}
              <p className="text-xs text-slate-600 min-w-0">
                <span className="font-semibold text-slate-800">{t('Packing photo')}</span>
                <span className="block">{t('Packed {when}', { when: packedWhen })}{packing.taken_by_name ? ` · ${packing.taken_by_name}` : ''}</span>
              </p>
            </div>
          )}
          {takesPhoto && (
            <p data-testid="packing-hint" className="-mt-1.5 mb-3 text-xs flex items-start gap-1 text-slate-500">
              <Camera className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span>{t('The buyer sees this photo. Write {number} on the parcel or a note, and keep it in the photo.', { number: order.order_number })}</span>
            </p>
          )}
          {qrOpen && (
            <p data-testid="handover-track" className="-mt-1.5 mb-3 text-xs flex items-start gap-1 text-slate-500">
              <QrCode className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span>
                {t('QR issued {when}', { when: formatAppDate(new Date(handover.issued_at), 'h:mm a') })}
                {' · '}
                {handover.first_shown_at
                  ? t('Shown on the buyer’s phone {when}', { when: formatAppDate(new Date(handover.last_shown_at || handover.first_shown_at), 'h:mm a') })
                  : t('Not opened by the buyer yet')}
              </span>
            </p>
          )}
          {courierLink && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCourierLink(order); }}
              className="-mt-1 mb-3 w-full h-9 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5"
              data-testid="order-courier-link"
            >
              <Bike className="w-4 h-4" />
              {handover.courier_link
                ? (handover.courier_opened_at
                  ? t('Courier link · opened {when}', { when: formatAppDate(new Date(handover.courier_opened_at), 'h:mm a') })
                  : t('Courier link · not opened yet'))
                : t('Send a courier link')}
            </button>
          )}

          {/* Action buttons — one consistent horizontal row across every status
              (wraps only if it truly has to on a very narrow screen), instead of the
              previous mix of a sometimes-column wrapper plus a separate full-width
              Cancel block underneath. */}
          <div className="flex items-center gap-2">
            {canEditOrders && order.payment_status !== 'paid' && (isShop ? order.status !== 'cancelled' : (order.status === 'completed' || order.status === 'ready')) && (
              paymentQrUrl ? (
                // Frontline staff workflow: show the QR, let the customer pay, confirm
                // from inside that same modal — rather than a blind "Mark as Paid"
                // button with no payment prompt attached to it.
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPaymentQR(true); }}
                  className="flex-1 h-11 flex items-center justify-center rounded-lg transition-colors"
                  style={{ border: '1.5px solid #16a34a', color: '#16a34a', background: '#f0fdf4' }}
                  title={t('Show payment QR')}
                >
                  <QrCode className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPaymentQR(true); }}
                  className="flex-1 h-11 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                  style={{ border: '1.5px solid #16a34a', color: '#16a34a', background: '#f0fdf4' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#16a34a'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.color = '#16a34a'; }}
                >
                  {t('💳 Mark as Paid')}
                </button>
              )
            )}
            {showPrint && canPrintReceipts && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowReceipt(true); }}
                className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ border: '1.5px solid rgb(var(--color-primary))', color: 'rgb(var(--color-primary))', background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--color-primary),0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Printer className="w-3.5 h-3.5" />{' '}{t('Receipt')}
              </button>
            )}
            {canPrintChit && !isFinal && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowChit(true); }}
                title={t('Print kitchen order chit')}
                className="h-11 px-3 flex-shrink-0 flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors border border-slate-300 text-slate-600"
                onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Printer className="w-4 h-4" />{' '}{t('Order')}
              </button>
            )}
            {isShop && order.status === 'pending' && canEditOrders && canCancelOrders && (
              <button
                onClick={(e) => { e.stopPropagation(); if (window.confirm(t('Decline this order? The buyer will see it as cancelled.'))) onStatusUpdate(order.id, 'cancelled'); }}
                className="h-11 px-3 flex-shrink-0 rounded-lg text-sm font-semibold border border-red-200 text-red-600 bg-white"
                data-testid="shop-decline"
              >
                {t('Decline')}
              </button>
            )}
            {action && canEditOrders && (
              <button
                data-tour="order-status-btn"
                data-testid={scansQr ? 'order-scan-qr' : takesPhoto ? 'order-packing-photo' : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (scansQr) onHandover(order);
                  else if (takesPhoto) onPackingPhoto(order);
                  else onStatusUpdate(order.id, action.next);
                }}
                className="flex-1 h-11 rounded-lg text-sm font-semibold text-white active:scale-95 transition-transform"
                style={{
                  ...(useThemeButton
                    ? { background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }
                    : { background: '#334155' }),
                  animation: 'orderActionPulse 2s ease-in-out infinite',
                }}
              >
                {scansQr ? <><ScanLine className="inline-block w-4 h-4 -mt-0.5 mr-1" />{t('Scan QR')}</>
                  : takesPhoto ? <><Camera className="inline-block w-4 h-4 -mt-0.5 mr-1" />{t('Packed · take photo')}</>
                    : t(action.label)}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes orderActionPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(15, 23, 42, 0.25); }
          50% { box-shadow: 0 0 0 6px rgba(15, 23, 42, 0); }
        }
      `}</style>

      {/* The packing photo, full screen (outside the card: a tap on it isn't the card's). */}
      {viewPhoto && packingUrl && (
        <PackingPhotoViewer
          src={packingUrl}
          words={{ title: t('Packing photo for order #{number}', { number: order.order_number }), close: t('Close photo') }}
          onClose={() => setViewPhoto(false)}
        />
      )}

      {/* Edit Order Sheet */}
      {showEditOrder && (
        <EditOrderModal
          order={order}
          tenantId={tenantId}
          currency={currency}
          canCancel={canCancelOrders && !isFinal}
          onClose={() => setShowEditOrder(false)}
          onSaved={(updatedOrder) => {
            setShowEditOrder(false);
            onOrderUpdated?.(updatedOrder);
          }}
          onCancelOrder={() => {
            onStatusUpdate(order.id, 'cancelled');
            setShowEditOrder(false);
          }}
        />
      )}

      {/* Receipt Preview Sheet */}
      {showReceipt && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowReceipt(false)}
        >
          <div
            style={{ background: '#f8fafc', borderRadius: '20px 20px 0 0', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', background: 'white', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{receiptBill ? t('{tableName} bill', { tableName: receiptBill.tableName }) : t('Receipt Preview')}</p>
              <button
                onClick={() => setShowReceipt(false)}
                style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#64748b' }}
              >✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
              {receiptBillState === 'loading' && (
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>{t('Loading the whole table\'s bill…')}</p>
              )}
              {receiptBillState === 'failed' && (
                <p style={{ textAlign: 'center', color: '#b45309', fontSize: 13, margin: '0 0 12px' }}>{t('Couldn\'t load the whole table\'s bill, so this shows this order only.')}</p>
              )}
              {receiptBill ? (
              <div style={{ background: 'white', color: '#0f172a', borderRadius: 12, padding: '24px 20px', fontFamily: '"Courier New", Courier, monospace', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', maxWidth: 360, margin: '0 auto' }}>
                <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, margin: '0 0 2px', letterSpacing: '0.02em' }}>{merchantName || pt('Receipt')}</p>
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: 11, margin: '0 0 12px' }}>
                  {new Date().toLocaleString(printed.locale, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
                <p style={{ margin: '5px 0', fontSize: 12 }}><strong>{pt('Table:')}</strong> {receiptBill.tableName}</p>
                <p style={{ margin: '5px 0', fontSize: 12 }}><strong>{pt('Orders:')}</strong> {receiptBill.orderNumbers.map(n => `#${n}`).join(', ') || '-'}</p>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
                {receiptBill.items.map((item, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ flex: 1, marginRight: 8 }}>{item.quantity}× {item.name}</span>
                      <span style={{ flexShrink: 0, fontWeight: 500 }}>{formatMoney(item.total, currency)}</span>
                    </div>
                    {item.variant && <p style={{ margin: '2px 0 0 14px', color: '#64748b', fontSize: 11 }}>({item.variant})</p>}
                  </div>
                ))}
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
                {receiptBill.subtotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{pt('Subtotal')}</span><span>{formatMoney(receiptBill.subtotal, currency)}</span>
                  </div>
                )}
                {receiptBill.tax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{pt('Tax')}</span><span>{formatMoney(receiptBill.tax, currency)}</span>
                  </div>
                )}
                {receiptBill.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{pt('Discount')}</span><span>-{formatMoney(receiptBill.discount, currency)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13, marginTop: 6, padding: '6px 0', borderTop: '1px solid #e2e8f0' }}>
                  <span>{pt('TOTAL')}</span><span>{formatMoney(receiptBill.total, currency)}</span>
                </div>
                <p style={{ margin: '4px 0', fontSize: 12, fontWeight: 700 }}>{paymentText(receiptBill, pt)}</p>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: 11, margin: '4px 0' }}>{pt('Thank you for your visit!')}</p>
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 10, margin: '4px 0' }}>{pt('Powered by Sellio')}</p>
              </div>
              ) : (
              <div style={{ background: 'white', color: '#0f172a', borderRadius: 12, padding: '24px 20px', fontFamily: '"Courier New", Courier, monospace', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', maxWidth: 360, margin: '0 auto' }}>
                <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, margin: '0 0 2px', letterSpacing: '0.02em' }}>{merchantName || pt('Receipt')}</p>
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: 11, margin: '0 0 12px' }}>
                  {new Date(order.created_date || Date.now()).toLocaleString(printed.locale, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
                <p style={{ margin: '5px 0', fontSize: 12 }}><strong>{pt('Order:')}</strong> #{order.order_number || order.id?.slice(-6)}</p>
                {order.table_name && <p style={{ margin: '5px 0', fontSize: 12 }}><strong>{pt('Table:')}</strong> {order.table_name}</p>}
                {order.customer_name && order.customer_name.toLowerCase() !== 'nil' && (
                  <p style={{ margin: '5px 0', fontSize: 12 }}><strong>{pt('Customer:')}</strong> {order.customer_name}</p>
                )}
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
                {(order.items || []).map((item, i) => {
                  const lineTotal = formatMoney((item.price || item.unit_price || 0) * (item.quantity || 1), currency);
                  return (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ flex: 1, marginRight: 8 }}>{item.quantity}× {item.name || item.product_name}</span>
                        <span style={{ flexShrink: 0, fontWeight: 500 }}>{lineTotal}</span>
                      </div>
                      {item.variant && <p style={{ margin: '2px 0 0 14px', color: '#64748b', fontSize: 11 }}>({item.variant})</p>}
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
                {order.subtotal && parseFloat(order.subtotal) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{pt('Subtotal')}</span><span>{formatMoney(parseFloat(order.subtotal || 0), currency)}</span>
                  </div>
                )}
                {order.tax_amount && parseFloat(order.tax_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{pt('Tax')}</span><span>{formatMoney(parseFloat(order.tax_amount || 0), currency)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13, marginTop: 6, padding: '6px 0', borderTop: '1px solid #e2e8f0' }}>
                  <span>{pt('TOTAL')}</span><span>{formatMoney(parseFloat(order.total_amount || 0), currency)}</span>
                </div>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: 11, margin: '4px 0' }}>{pt('Thank you for your visit!')}</p>
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 10, margin: '4px 0' }}>{pt('Powered by Sellio')}</p>
              </div>
              )}
            </div>
            <div style={{ padding: '12px 16px 28px', display: 'flex', gap: 8, background: 'white', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
              <button
                onClick={() => setShowReceipt(false)}
                style={{ flex: 1, padding: '13px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
              >{t('Close')}</button>
              <button
                onClick={handleActualPrint}
                disabled={receiptPrinting || receiptBillState === 'loading'}
                style={{ flex: 2, padding: '13px', borderRadius: 10, border: 'none', background: receiptPrinting ? '#e2e8f0' : 'var(--color-primary-gradient, rgb(var(--color-primary)))', fontSize: 13, fontWeight: 600, color: receiptPrinting ? '#94a3b8' : 'white', cursor: receiptPrinting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {receiptPrinting
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />{' '}{t('Sending…')}</>
                  : <><Printer size={14} />{' '}{t('Print Receipt')}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Chit Preview Sheet — same pattern as the Receipt Preview
          above: show staff exactly what the kitchen printout will contain
          before committing it to paper. */}
      {showChit && (
        <ChitPreviewSheet
          order={order}
          merchantName={merchantName}
          printing={chitPrinting}
          onClose={() => setShowChit(false)}
          onPrint={handlePrintChit}
        />
      )}

      {/* Payment sheet: shows the shop's payment QR when one is uploaded, then records how
          the customer paid (cash, QR or card). A table order settles the whole table bill,
          since each table pays once for everything it ordered. */}
      {showPaymentQR && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.6)' }}
          onClick={() => { if (!payBusy) setShowPaymentQR(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tableBill ? `Settle ${order.table_name || 'table'}` : t('Take payment')}
            style={{ background: 'white', borderRadius: 20, padding: '24px 22px', maxWidth: 340, width: '100%', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              {tableBill ? `Settle ${order.table_name || 'table'}` : (paymentQrUrl ? (paymentQrLabel || t('Scan to Pay')) : t('Take payment'))}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>
              {tableBill
                ? t('Whole table bill · {total}', { total: formatMoney(tableBill.total, currency) })
                : `#${order.order_number || order.id?.slice(-6)} · ${formatMoney(parseFloat(order.total_amount || 0), currency)}`}
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#94a3b8' }}>
              {tableBill ? t('Pays every order on this table and frees the table.') : t('How did the customer pay?')}
            </p>
            {paymentQrUrl && (
              <img
                src={paymentQrUrl}
                alt={t('Payment QR')}
                style={{ width: '100%', maxWidth: 240, aspectRatio: '1', objectFit: 'contain', borderRadius: 12, border: '1px solid #f1f5f9', margin: '0 auto 20px' }}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
              {[['cash', t('Cash')], ['qr', qrPayLabel], ['card', t('Card')]].map(([m, l]) => (
                <button
                  key={m}
                  disabled={payBusy}
                  onClick={() => pay(m)}
                  style={{ minHeight: 48, padding: '8px 4px', borderRadius: 12, border: 'none', background: '#16a34a', color: 'white', fontSize: 13, fontWeight: 700, lineHeight: 1.2, cursor: payBusy ? 'default' : 'pointer', opacity: payBusy ? 0.6 : 1 }}
                >
                  {payBusy ? '…' : l}
                </button>
              ))}
            </div>
            <button
              disabled={payBusy}
              onClick={() => setShowPaymentQR(false)}
              style={{ width: '100%', padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {t('Close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Orders() {
  const { t } = useAppText();
  const { tenantId, tenant, hasPermission, subscription, canUseFeature, isLoading: tenantLoading } = useTenant();
  const ordersTour = useProductTour('orders');
  const { appUser } = useAppUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // The last load failed (the list then says so, rather than "No orders yet").
  const [loadFailed, setLoadFailed] = useState(false);
  // When the list on screen was loaded, and (keptLatest) whether it's the copy on the phone:
  // with no connection the list stays, and says when it's from (OfflineNote).
  const online = useOnline();
  const [listAt, setListAt] = useState(null);
  const [keptLatest, setKeptLatest] = useState(null); // { latest: n kept, when fewer than there were }
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const ownerId = appUser?.id || null;
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const lastSeenDateRef = useRef(null);
  const fallbackPollRef = useRef(null);

  const isFnB = isFnBIndustry(tenant?.industry);
  const isShop = isShopTenant(tenant);
  const statusTabs = isShop ? shopStatusTabs(isFnB) : STATUS_TABS;
  const currency = tenant?.settings?.currency || tenant?.currency || 'SGD';
  const canViewOrders = hasPermission?.('orders.view');
  const canHandOver = isShop && !!hasPermission?.('orders.edit');

  // Handover QR (lib/handover.js): what the shop may know about its orders' QRs (whether the
  // buyer has one, whether its code waits, issued / shown / verified, the courier link), the
  // scanner ({ order } from a card, { token } from a sellio.sg/Orders?qr= link, {} from Scan QR)
  // and the courier link sheet (the order it's for).
  const [handovers, setHandovers] = useState(null);
  const [scanner, setScanner] = useState(null);
  const [courierFor, setCourierFor] = useState(null);
  const [handoversTick, setHandoversTick] = useState(0);
  // Packing photos (lib/packingPhoto.js): each order's latest, links to show them (an hour each,
  // made again after 45 minutes), and the camera sheet (the order it's for).
  const [packing, setPacking] = useState({});
  const [packingLinks, setPackingLinks] = useState({});
  const [packingFor, setPackingFor] = useState(null);

  // Sound alerts and their reminders (src/lib/useOrderAlerts.js). Here a new order rings and is
  // reminded about until someone accepts it; an order becoming ready rings once.
  const alerts = useOrderAlerts({ tenantId, userId: appUser?.id, orders });
  const { ring: ringAlert, seen: seenOrder } = alerts;

  const fetchOrders = useCallback(async (throwOnError = false) => {
    if (!tenantId) return;
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .order('created_date', { ascending: false });
    if (!error) {
      const rows = data || [];
      setOrders(rows);
      setListAt(Date.now());
      setKeptLatest(null);
      if (ownerId) keepSnapshot(`orders:${tenantId}`, { orders: rows.slice(0, KEPT_ORDERS), total: rows.length }, ownerId);
    } else if (ownerId && !ordersRef.current.length) {
      // No orders on screen yet (the app opened offline): the latest ones kept on the phone.
      const kept = loadSnapshot(`orders:${tenantId}`, ownerId);
      if (Array.isArray(kept?.data?.orders) && kept.data.orders.length) {
        setOrders(kept.data.orders);
        setListAt(kept.savedAt);
        setKeptLatest(kept.data.total > kept.data.orders.length ? { latest: kept.data.orders.length } : {});
      }
    }
    setLoadFailed(!!error);
    setIsLoading(false);
    if (error && throwOnError === true) throw error;
  }, [tenantId, ownerId]);

  useEffect(() => {
    if (!tenantId) return;

    fetchOrders();

    let supabaseClient;
    let channel;

    getSupabase().then(sc => {
      supabaseClient = sc;
      channel = sc
        .channel(`orders-page-${tenantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            console.log('Orders page real-time update:', payload.eventType, payload.new?.order_number);
            fetchOrders();

            // Kitchen printing is handled once by the workspace listener.

            // Sound alerts. For a deleted order realtime sends only its id.
            const before = seenOrder(payload.eventType === 'DELETE' ? { ...payload.old, status: undefined } : payload.new);
            if (payload.eventType === 'INSERT' && payload.new?.status === 'pending') ringAlert(payload.new);
            if (payload.eventType === 'UPDATE' && payload.new?.status === 'ready' && before !== 'ready') {
              ringAlert(payload.new, { remind: false });
            }
          }
        )
        .subscribe((status) => {
          console.log('Orders page subscription status:', status);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Orders page: real-time failed, falling back to 30s polling');
            clearInterval(fallbackPollRef.current);
            fallbackPollRef.current = setInterval(fetchOrders, 30000);
          } else if (status === 'SUBSCRIBED') {
            clearInterval(fallbackPollRef.current);
          }
        });
    });

    return () => {
      clearInterval(fallbackPollRef.current);
      if (supabaseClient && channel) supabaseClient.removeChannel(channel);
    };
  }, [tenantId, fetchOrders, ringAlert, seenOrder]);

  // The QRs' state follows the orders: loaded again when one is added or changes step, and every
  // 30 seconds while the page is open (it shows when a buyer opened their QR).
  const handoverKey = useMemo(() => (isShop
    ? orders.slice(0, 500).map((o) => `${o.id}:${o.status}`).join(',')
    : ''), [orders, isShop]);
  useEffect(() => {
    if (!isShop || !tenantId) return undefined;
    const ids = handoverKey ? handoverKey.split(',').map((part) => part.split(':')[0]) : [];
    if (!ids.length) { setHandovers({}); return undefined; }
    let live = true;
    fetchShopHandovers(tenantId, ids)
      .then((map) => { if (live) setHandovers(map); })
      .catch((e) => console.warn('Handover QRs failed to load:', e?.message || e));
    return () => { live = false; };
  }, [isShop, tenantId, handoverKey, handoversTick]);
  useEffect(() => {
    if (!isShop || !tenantId) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') setHandoversTick((n) => n + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [isShop, tenantId]);
  // The packing photos follow the orders the same way (only orders with a QR have them).
  const photoKey = useMemo(() => (handovers
    ? Object.values(handovers).filter((h) => h?.has_qr).map((h) => h.order_id).sort().join(',')
    : ''), [handovers]);
  useEffect(() => {
    if (!isShop || !tenantId || !photoKey) { setPacking({}); return undefined; }
    let live = true;
    fetchShopPackingPhotos(tenantId, photoKey.split(','))
      .then((map) => { if (live) setPacking(map); })
      .catch((e) => console.warn('Packing photos failed to load:', e?.message || e));
    return () => { live = false; };
  }, [isShop, tenantId, photoKey, handoversTick]);
  useEffect(() => {
    const now = Date.now();
    const paths = Object.values(packing).map((p) => p?.path).filter((path) => path && !(packingLinks[path]?.at > now - 45 * 60000));
    if (!paths.length) return undefined;
    let live = true;
    photoLinks(paths)
      .then((links) => {
        if (!live) return;
        const at = Date.now();
        setPackingLinks((prev) => {
          const next = { ...prev };
          for (const [path, url] of Object.entries(links)) next[path] = { url, at };
          return next;
        });
      })
      .catch((e) => console.warn('Packing photo links failed:', e?.message || e));
    return () => { live = false; };
  }, [packing]); // eslint-disable-line react-hooks/exhaustive-deps

  // A buyer's QR scanned with the phone's own camera opens sellio.sg/Orders?qr=<token>.
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('qr');
    if (!token || !tenantId || !tenant || tenantLoading) return;
    if (canHandOver) setScanner({ token });
    navigate(location.pathname, { replace: true });
  }, [location.search, tenantId, tenant, tenantLoading, canHandOver]);

  const handleStatusUpdate = async (orderId, newStatus) => {
    if (blockedOffline(t('Couldn’t update the order'), t('Updating an order needs the internet.'), t)) return;
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus, updated_date: new Date().toISOString() })
      .eq('id', orderId);
    // Packed only with its photo (the server's rule): the camera, instead of an error.
    const waiting = error?.hint === PACKING_REQUIRED ? orders.find((o) => o.id === orderId) : null;
    if (waiting && isShop && canHandOver) { setPackingFor(waiting); return; }
    if (error) { showError(error, t('Couldn’t update the order'), { t }); return; }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    toast.success(t('Order updated'));
  };

  // One bill per table: paying a table order settles the whole table (mark_order_paid
  // calls settle_table on the server). Other orders are paid on their own, as before.
  // Free shops keep the order's step (it still has to be collected or delivered).
  const handleMarkPaid = async (order, keepStep = false, method = 'cash') => {
    if (blockedOffline(t('Couldn’t mark it as paid'), t('Updating an order needs the internet.'), t)) return false;
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('mark_order_paid', {
      p_order_id: order.id, p_method: method, p_keep_step: keepStep,
    });
    if (error) {
      // mark_order_paid's own reasons (22023, P0002) are shown as they are.
      showError(error, t('Couldn’t mark it as paid'), { t });
      return false;
    }

    if (data?.scope === 'table') {
      if (data.already_closed) toast.info(t('This table was already settled.'));
      else toast.success(t('{label} settled · {amount}', { label: order.table_name || t('Table'), amount: formatMoney(Number(data.amount || 0), currency) }));
      await fetchOrders();
    } else {
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, payment_status: 'paid', payment_method: method, ...(keepStep ? {} : { status: 'completed' }) } : o
      ));
      toast.success(data?.already_paid ? t('Already marked as paid') : t('Marked as paid ✓'));
    }
    return true;
  };

  const pendingCheckouts = useSyncExternalStore(subscribePendingCheckouts, getPendingCheckouts, getPendingCheckouts).filter(item => item.tenantId === tenantId);
  useAppRefreshHandler(() => fetchOrders(true));

  const tabOrders = activeTab === 'all' ? orders : orders.filter(o => o.status === activeTab);
  // Spaces either side don't count (phone keyboards add one after a word).
  const orderFound = (o, text) => {
    const q = text.trim().toLowerCase();
    return (
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.table_name || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      (isShop && (o.customer_phone || '').toLowerCase().includes(q)) ||
      (o.items || []).some(i => (i.name || i.product_name || '').toLowerCase().includes(q))
    );
  };
  const filteredOrders = searchQuery.trim() ? tabOrders.filter(o => orderFound(o, searchQuery)) : tabOrders;
  // A search that finds nothing here (UX state 6): say if it finds orders with other
  // statuses, else offer the likely spelling of a customer, table or item.
  const searchMissed = searchQuery.trim() !== '' && filteredOrders.length === 0 && orders.length > 0;
  const foundElsewhere = searchMissed && activeTab !== 'all' ? orders.filter(o => orderFound(o, searchQuery)).length : 0;
  const searchSuggestion = searchMissed && !foundElsewhere
    ? didYouMean(
        searchQuery,
        tabOrders.flatMap(o => [o.customer_name, o.table_name, ...(o.items || []).map(i => i.name || i.product_name)]).filter(Boolean),
        text => tabOrders.some(o => orderFound(o, text)),
      )
    : null;
  const countFor = (status) => orders.filter(o => o.status === status).length;

  const handleDownload = () => {
    if (isShop) {
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const shopRows = orders.map(o => [
        o.order_number || '', shopStatusLabel(o.status, shopMethod(o), isFnB), shopMethod(o) === 'delivery' ? 'Delivery' : 'Self-collect',
        o.fulfilment?.date || '', cell(o.customer_name), cell(o.customer_phone), cell(o.fulfilment?.address),
        cell((o.items || []).map(i => `${i.quantity}x ${i.name || i.product_name}`).join(', ')),
        (Number(o.fulfilment?.fee) || 0).toFixed(currencyDecimals(currency)), parseFloat(o.total_amount || 0).toFixed(currencyDecimals(currency)),
        o.payment_status === 'paid' ? 'paid' : 'unpaid', o.created_date || '',
      ].join(','));
      const shopCsv = '\uFEFF' + ['order_number,status,method,date,buyer,mobile,address,items,delivery_charge,total_amount,payment,created_date', ...shopRows].join('\n');
      const shopBlob = new Blob([shopCsv], { type: 'text/csv;charset=utf-8;' });
      if (inAppFiles()) {
        saveFileInApp(shopBlob, `orders_${new Date().toISOString().split('T')[0]}.csv`, { tenantId, label: t('Orders file') });
        return;
      }
      const shopUrl = URL.createObjectURL(shopBlob);
      const link = document.createElement('a');
      link.href = shopUrl;
      link.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(shopUrl);
      return;
    }
    const rows = orders.map(o => {
      const itemsStr = (o.items || []).map(i => `${i.quantity}x ${i.name || i.product_name}`).join(', ');
      return [
        o.order_number || '',
        o.status || '',
        o.table_name || '',
        `"${itemsStr}"`,
        parseFloat(o.total_amount || 0).toFixed(currencyDecimals(currency)),
        o.created_date || '',
      ].join(',');
    });
    const csv = '\uFEFF' + ['order_number,status,table_name,items,total_amount,created_date', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    if (inAppFiles()) {
      saveFileInApp(blob, `orders_${new Date().toISOString().split('T')[0]}.csv`, { tenantId, label: t('Orders file') });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingCount   = countFor('pending');
  const confirmCount   = countFor('confirmed');
  const preparingCount = countFor('preparing');
  const readyCount     = countFor('ready');

  const STAT_CARDS = isShop ? [
    { label: t('New'),       count: pendingCount,   status: 'pending',   bg: 'bg-amber-50',  border: 'border-amber-200',  activeBorder: '#f59e0b', text: 'text-amber-900',  sub: 'text-amber-700' },
    { label: t('Accepted'),  count: confirmCount,   status: 'confirmed', bg: 'bg-blue-50',   border: 'border-blue-200',   activeBorder: '#3b82f6', text: 'text-blue-900',   sub: 'text-blue-700' },
    { label: t('Preparing'), count: preparingCount, status: 'preparing', bg: 'bg-purple-50', border: 'border-purple-200', activeBorder: '#8b5cf6', text: 'text-purple-900', sub: 'text-purple-700' },
    { label: t('Ready / Out'), count: readyCount,   status: 'ready',     bg: 'bg-green-50',  border: 'border-green-200',  activeBorder: '#10b981', text: 'text-green-900',  sub: 'text-green-700' },
  ] : [
    { label: t('New'),       count: pendingCount,   status: 'pending',   bg: 'bg-amber-50',  border: 'border-amber-200',  activeBorder: '#f59e0b', text: 'text-amber-900',  sub: 'text-amber-700' },
    { label: t('Confirmed'), count: confirmCount,   status: 'confirmed', bg: 'bg-blue-50',   border: 'border-blue-200',   activeBorder: '#3b82f6', text: 'text-blue-900',   sub: 'text-blue-700' },
    { label: t('Preparing'), count: preparingCount, status: 'preparing', bg: 'bg-purple-50', border: 'border-purple-200', activeBorder: '#8b5cf6', text: 'text-purple-900', sub: 'text-purple-700' },
    { label: t('Ready'),     count: readyCount,     status: 'ready',     bg: 'bg-green-50',  border: 'border-green-200',  activeBorder: '#10b981', text: 'text-green-900',  sub: 'text-green-700' },
  ];

  return (
    <RequirePermission permission="orders.view">
        <div className="space-y-4">
          {pendingCheckouts.length > 0 && (
            <div role="status" aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {pendingCheckouts.map(item => <p key={item.requestId}>{t('{count} item(s):', { count: item.count })}{' '}{item.state === 'sending' ? t('Sending order…') : t('Submission unconfirmed. Check the order list, then retry the same cart.')}</p>)}
            </div>
          )}
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{t('Orders')}</h1>
              <p className="text-sm text-slate-500">{t('Manage incoming and active orders')}</p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {isFnB && canUseFeature('can_use_kitchen_display') && (
                <button
                  data-tour="kitchen-display-btn"
                  onClick={() => navigate(createPageUrl('KitchenDisplay'))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors"
                  style={{ border: '1.5px solid rgb(var(--color-primary))', color: 'rgb(var(--color-primary))', background: 'rgba(var(--color-primary), 0.08)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary-gradient)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--color-primary), 0.08)'; e.currentTarget.style.color = 'rgb(var(--color-primary))'; }}
                >
                  <Monitor className="w-4 h-4" />{' '}{t('Kitchen Display')}
                </button>
              )}
              <div data-tour="sound-alerts-toggle" className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Switch id="sound" checked={alerts.on} onCheckedChange={alerts.setOn} className="scale-90" />
                  <Label htmlFor="sound" className="flex items-center gap-1 cursor-pointer text-xs text-slate-600">
                    {alerts.on ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                    {t('Sound Alerts')}
                  </Label>
                </div>
                {alerts.on && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{t('Repeat:')}</span>
                    {REMIND_EVERY.map(s => (
                      <button
                        key={s}
                        onClick={() => alerts.setEvery(s)}
                        aria-pressed={alerts.every === s}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${alerts.every === s ? 'text-white' : 'bg-slate-100 text-slate-500'}`}
                        style={alerts.every === s ? { background: 'var(--color-primary-gradient)' } : {}}
                      >
                        {s === 30 ? '30s' : s === 60 ? '1m' : '2m'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search + Download */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isShop ? t('Search orders, buyers, items...') : t('Search orders, table, items...')}
                className="w-full pl-9 pr-3 h-9 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'rgba(var(--color-primary),0.3)' }}
              />
            </div>
            {canHandOver && (
              <button
                onClick={() => setScanner({})}
                data-testid="orders-scan-qr"
                className="flex items-center gap-1.5 px-3 h-9 text-sm font-semibold rounded-lg text-white transition-colors flex-shrink-0"
                style={{ background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
              >
                <ScanLine className="w-4 h-4" />{' '}{t('Scan QR')}
              </button>
            )}
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t('Download')}</span>
            </button>
          </div>

          {/* Table Call Alerts */}
          {!isShop && <TableCallAlerts tenantId={tenantId} />}

          {/* Stats — 4 clickable cards */}
          <div data-tour="order-status-cards" className="grid grid-cols-4 gap-2">
            {STAT_CARDS.map(card => {
              const isActive = activeTab === card.status;
              return (
                <button
                  key={card.status}
                  onClick={() => setActiveTab(isActive ? 'all' : card.status)}
                  className={`${card.bg} rounded-xl py-3 px-1.5 text-center cursor-pointer transition-all active:scale-95 border-2 ${isActive ? '' : card.border}`}
                  style={isActive ? { borderColor: card.activeBorder, boxShadow: `0 0 0 1px ${card.activeBorder}` } : {}}
                >
                  <p className={`text-[20px] font-bold leading-tight ${card.text}`}>{card.count}</p>
                  <p className={`text-[11px] font-medium ${card.sub}`}>{card.label}</p>
                </button>
              );
            })}
          </div>

          {/* Status tabs */}
          {/* The tabs keep their words on one line (中文 would otherwise break inside a word) and the
              row scrolls sideways when they don't all fit. */}
          <div data-tour="order-tabs" className="flex w-full gap-1 overflow-x-auto no-scrollbar">
            {statusTabs.map(tab => {
              const count = tab.value === 'all' ? orders.length : countFor(tab.value);
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex-1 shrink-0 whitespace-nowrap flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all active:scale-95 ${
                    isActive ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                  }`}
                  style={isActive ? { background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' } : {}}
                >
                  {t(tab.label)}
                  {count > 0 && (
                    <span className={`text-[10px] font-bold px-1 py-0 rounded-full min-w-[16px] text-center leading-4 ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Shown without a fresh load: when the list is from, and what still works. */}
          {!isLoading && orders.length > 0 && listAt && (!online || loadFailed || keptLatest) && (
            <OfflineNote {...listNoteWords({
              online, what: t('orders'), at: listAt, latest: keptLatest?.latest,
              offlineText: t('You can look through them. Updating an order needs the internet.'),
              failedText: t('Pull down to try again.'),
            }, undefined, t)} />
          )}

          {/* Orders list */}
          {isLoading ? (
            <LoadingShapes label={t('Loading orders')} t={t}><SkeletonList count={4} lines={3} imageSize={0} /></LoadingShapes>
          ) : filteredOrders.length === 0 ? (
            <div>
              <OrdersEmpty
                kind={ordersEmptyKind({ failed: loadFailed, total: orders.length, query: searchQuery, offline: !online })}
                query={searchQuery}
                tab={activeTab}
                isShop={isShop}
                tableOrdering={!!canUseFeature?.('can_use_table_ordering')}
                counter={!!canUseFeature?.('can_use_pos')}
                onSeeAll={() => setActiveTab('all')}
                onClearSearch={() => setSearchQuery('')}
                foundElsewhere={foundElsewhere}
                suggestion={searchSuggestion}
                onSearch={setSearchQuery}
                onRetry={() => { setIsLoading(true); fetchOrders(); }}
              />
              {/* Tour needs a card to point at even with zero real orders yet */}
              {ordersTour.eligible && (
                <div className="max-w-[280px] mx-auto mt-4">
                  <DummyOrderCard currency={currency} />
                </div>
              )}
            </div>
          ) : (
            // A gap, not space-y: each card's pop-ups sit beside it in the list, and space-y's
            // top margin would move those full-screen pop-ups 12px down too.
            <div className="flex flex-col gap-3">
              {filteredOrders.map((order, index) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  currency={currency}
                  merchantName={tenant?.name}
                  paymentQrUrl={tenant?.payment_qr_url}
                  paymentQrLabel={tenant?.payment_qr_label}
                  tenantId={tenantId}
                  onStatusUpdate={handleStatusUpdate}
                  onMarkPaid={handleMarkPaid}
                  onOrderUpdated={(updatedOrder) => setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o))}
                  onHandover={canHandOver ? (o) => setScanner({ order: o }) : undefined}
                  onCourierLink={canHandOver ? (o) => setCourierFor(o) : undefined}
                  onPackingPhoto={canHandOver ? (o) => setPackingFor(o) : undefined}
                  handover={handovers?.[order.id] || null}
                  packing={packing[order.id] || null}
                  packingUrl={packingLinks[packing[order.id]?.path]?.url || null}
                  tourTag={index === 0 && ordersTour.eligible}
                />
              ))}
            </div>
          )}
        </div>
      {scanner && (
        <HandoverSheet
          tenantId={tenantId}
          orders={orders}
          handovers={handovers}
          startOrder={scanner.order || null}
          startToken={scanner.token || null}
          onDone={() => { fetchOrders(); setHandoversTick((n) => n + 1); }}
          onClose={() => setScanner(null)}
        />
      )}
      {packingFor && (
        <PackingPhotoSheet
          tenantId={tenantId}
          order={packingFor}
          shopName={tenant?.name}
          onDone={(answer) => {
            setOrders((prev) => prev.map((o) => (o.id === answer.order_id ? { ...o, status: answer.status } : o)));
            setPacking((prev) => ({ ...prev, [answer.order_id]: { order_id: answer.order_id, path: answer.path, taken_at: answer.taken_at, taken_by_name: answer.taken_by_name, photos: 1 } }));
            fetchOrders();
            setHandoversTick((n) => n + 1);
          }}
          onClose={() => setPackingFor(null)}
        />
      )}
      {courierFor && (
        <CourierLinkSheet
          tenantId={tenantId}
          order={courierFor}
          info={handovers?.[courierFor.id] || null}
          shopName={tenant?.name}
          onChanged={() => setHandoversTick((n) => n + 1)}
          onClose={() => setCourierFor(null)}
        />
      )}
      {ordersTour.eligible && (
        <TourGuide
          steps={getOrdersSteps({ tier: subscription?.tier, listings: isShop, isDesktop: window.matchMedia('(min-width: 1024px)').matches })}
          run={ordersTour.eligible}
          onFinish={ordersTour.completeStage}
          tour={ordersTour}
        />
      )}
    </RequirePermission>
  );
}