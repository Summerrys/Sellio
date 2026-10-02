import React, { useRef, useState } from 'react';
import { CheckCircle2, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { printCounterOrder } from '@/lib/orderPrinting';
import { useBackToClose } from '@/lib/useBackToClose';

export default function CounterOrderResult({ order, tenant, tenantId, canPrintChit, printing, setPrinting, onClose }) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const printingRef = useRef(false);
  useBackToClose(receiptOpen, () => { if (printingRef.current) return false; setReceiptOpen(false); });
  const money = n => `${tenant?.currency || 'SGD'} ${(Number(n) || 0).toFixed(2)}`;
  const print = async kind => {
    if (printingRef.current) return;
    printingRef.current = true; setPrinting(true);
    try {
      await printCounterOrder(order, tenantId, tenant, kind);
      toast.success(kind === 'chit' ? 'Kitchen chit sent to printer' : 'Receipt sent to printer');
    } catch (error) {
      toast.error(error.message || 'Printing failed. The order is already sent; check the printer before trying again.');
    } finally { printingRef.current = false; setPrinting(false); }
  };
  return (
    <div className="ctr-sheet-back" onClick={() => { if (!printingRef.current) onClose(); }}>
      <div className="ctr-sheet" role="dialog" aria-modal="true" aria-label="Order sent" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <CheckCircle2 size={32} style={{ color: 'rgb(var(--color-primary))', flexShrink: 0 }} />
          <div><h3>Sent to kitchen</h3><p className="ctr-sheet-sub">{order.order_number} · {order.table_name || 'Takeaway'}</p></div>
        </div>
        <div className="ctr-total"><span>This order</span><b>{money(order.total_amount)}</b></div>
        {receiptOpen && (
          <section aria-label="Receipt preview" className="rounded-xl border border-slate-200 p-4 space-y-3 text-sm">
            <p className="font-bold">{tenant?.name || 'Receipt'}</p>
            {(order.items || []).map((item, index) => (
              <div key={index}>
                <div className="flex justify-between gap-3"><span>{item.quantity}× {item.name || item.product_name}</span><b className="whitespace-nowrap">{money((item.price ?? item.unit_price ?? 0) * item.quantity)}</b></div>
                {item.variant && <p className="text-slate-500">{item.variant}</p>}
                {item.notes && <p className="text-slate-500">{item.notes}</p>}
              </div>
            ))}
            {Number(order.tax_amount) > 0 && <p>Tax: {money(order.tax_amount)}</p>}
            <p className="font-bold">Total: {money(order.total_amount)}</p>
            <p className="text-slate-500">Payment: {order.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</p>
          </section>
        )}
        <button className="ctr-sheet-done flex items-center justify-center gap-2" disabled={printing} onClick={() => receiptOpen ? print('receipt') : setReceiptOpen(true)}>
          {printing ? <Loader2 size={22} className="animate-spin" /> : <Printer size={22} />}
          {printing ? 'Sending to printer…' : receiptOpen ? 'Print receipt' : 'Receipt / Print'}
        </button>
        {canPrintChit && <button className="ctr-back flex items-center justify-center gap-2 min-h-11" disabled={printing} onClick={() => print('chit')}><Printer size={20} /> Print kitchen chit</button>}
        <button className="ctr-cancel min-h-11" disabled={printing} onClick={onClose}>Continue taking orders</button>
      </div>
    </div>
  );
}
