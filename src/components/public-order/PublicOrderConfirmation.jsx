import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';

export default function PublicOrderConfirmation({ order, tenant, table, gradientStyle, currency, onNewOrder }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(t);
  }, []);

  const items = order.items || [];
  const total = order.total_amount || 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start px-4 pt-12 pb-8">
      <div
        className={`w-full max-w-sm transition-all duration-500 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
      >
        {/* Check animation */}
        <div className="flex justify-center mb-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: gradientStyle }}
          >
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Order Placed! 🎉</h1>
          <p className="text-slate-500 text-sm">We've received your order</p>
          <div className="inline-block mt-3 px-4 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm font-mono font-bold">
            {order.order_number}
          </div>
        </div>

        {/* Order summary card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">{tenant.name}</p>
              <p className="text-xs text-slate-500">{table.name}</p>
            </div>
            {tenant.logo_url && <img src={tenant.logo_url} alt={tenant.name} className="h-8 w-8 object-contain rounded-lg" />}
          </div>

          <div className="px-4 py-3 space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm">
                <span className="text-slate-700">{item.quantity}× {item.product_name}</span>
                <span className="font-medium text-slate-800">{currency} {Number(item.total).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-slate-100 flex justify-between">
            <span className="font-bold text-slate-900">Total</span>
            <span className="font-bold text-slate-900">{currency} {Number(total).toFixed(2)}</span>
          </div>
        </div>

        {/* Message */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-4 text-center mb-6">
          <p className="text-blue-800 text-sm font-medium">Your order has been received.</p>
          <p className="text-blue-600 text-sm mt-0.5">Please wait for your food. 😊</p>
        </div>

        {/* New order button */}
        <button
          onClick={onNewOrder}
          className="w-full h-12 rounded-2xl border-2 border-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-100 active:scale-95 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          Order More
        </button>
      </div>
    </div>
  );
}