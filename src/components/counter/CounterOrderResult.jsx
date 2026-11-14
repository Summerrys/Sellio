import React, { useRef, useState } from 'react';
import { CheckCircle2, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { printCounterOrder, printTableBill } from '@/lib/orderPrinting';
import { getSupabase } from '@/lib/supabaseClient';
import { loadTableBillForOrder } from '@/lib/tableBill';
import { useBackToClose } from '@/lib/useBackToClose';
import { formatMoney } from '@/lib/money';
import { useAppText, appT } from '@/lib/appText';

export default function CounterOrderResult({ order, tenant, tenantId, canPrintChit, printing, setPrinting, onClose }) {
  const { t } = useAppText();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const printingRef = useRef(false);
  useBackToClose(receiptOpen, () => { if (printingRef.current) return false; setReceiptOpen(false); });
  const money = n => formatMoney(Number(n) || 0, tenant?.currency || 'SGD');
  const print = async kind => {
    if (printingRef.current) return;
    printingRef.current = true; setPrinting(true);
    try {
      await printCounterOrder(order, tenantId, tenant, kind);
      toast.success(kind === 'chit' ? t('Kitchen chit sent to printer') : t('Receipt sent to printer'));
    } catch (error) {
      toast.error(error.message || t('Printing failed. The order is already sent; check the printer before trying again.'));
    } finally { printingRef.current = false; setPrinting(false); }
  };
  // A table round is part of one table bill: print the whole bill so far, not this round alone.
  const isTableRound = !!order.table_id;
  const printTableSoFar = async () => {
    if (printingRef.current) return;
    printingRef.current = true; setPrinting(true);
    try {
      const bill = await loadTableBillForOrder(await getSupabase(), tenantId, order);
      if (!bill) throw new Error(appT("Could not load this table's bill. Check your connection and try again."));
      await printTableBill(bill, tenantId, tenant);
      toast.success(t('{tableName} bill sent to printer', { tableName: bill.tableName }));
    } catch (error) {
      toast.error(error.message || t('Printing failed. The order is already sent; check the printer before trying again.'));
    } finally { printingRef.current = false; setPrinting(false); }
  };
  return (
    <div className="ctr-sheet-back" onClick={() => { if (!printingRef.current) onClose(); }}>
      <div className="ctr-sheet" role="dialog" aria-modal="true" aria-label={t('Order sent')} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <CheckCircle2 size={32} style={{ color: 'rgb(var(--color-primary))', flexShrink: 0 }} />
          <div><h3>{t('Sent to kitchen')}</h3><p className="ctr-sheet-sub">{order.order_number} · {order.table_name || t('Takeaway')}</p></div>
        </div>
        <div className="ctr-total"><span>{t('This order')}</span><b>{money(order.total_amount)}</b></div>
        {receiptOpen && (
          <section aria-label={t('Receipt preview')} className="rounded-xl border border-slate-200 p-4 space-y-3 text-sm">
            <p className="font-bold">{tenant?.name || t('Receipt')}</p>
            {(order.items || []).map((item, index) => (
              <div key={index}>
                <div className="flex justify-between gap-3"><span>{item.quantity}× {item.name || item.product_name}</span><b className="whitespace-nowrap">{money((item.price ?? item.unit_price ?? 0) * item.quantity)}</b></div>
                {item.variant && <p className="text-slate-500">{item.variant}</p>}
                {item.notes && <p className="text-slate-500">{item.notes}</p>}
              </div>
            ))}
            {Number(order.tax_amount) > 0 && <p>{t('Tax: {tax_amount}', { tax_amount: money(order.tax_amount) })}</p>}
            <p className="font-bold">{t('Total: {total_amount}', { total_amount: money(order.total_amount) })}</p>
            <p className="text-slate-500">{t('Payment:')}{' '}{order.payment_status === 'paid' ? t('Paid') : t('Unpaid')}</p>
          </section>
        )}
        {isTableRound ? (
          <button className="ctr-sheet-done flex items-center justify-center gap-2" disabled={printing} onClick={printTableSoFar}>
            {printing ? <Loader2 size={22} className="animate-spin" /> : <Printer size={22} />}
            {printing ? t('Sending to printer…') : t('Print table bill so far')}
          </button>
        ) : (
          <button className="ctr-sheet-done flex items-center justify-center gap-2" disabled={printing} onClick={() => receiptOpen ? print('receipt') : setReceiptOpen(true)}>
            {printing ? <Loader2 size={22} className="animate-spin" /> : <Printer size={22} />}
            {printing ? t('Sending to printer…') : receiptOpen ? t('Print receipt') : t('Receipt / Print')}
          </button>
        )}
        {canPrintChit && <button className="ctr-back flex items-center justify-center gap-2 min-h-11" disabled={printing} onClick={() => print('chit')}><Printer size={20} />{' '}{t('Print kitchen chit')}</button>}
        <button className="ctr-cancel min-h-11" disabled={printing} onClick={onClose}>{t('Continue taking orders')}</button>
      </div>
    </div>
  );
}
