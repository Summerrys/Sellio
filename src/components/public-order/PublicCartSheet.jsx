import { useState } from 'react';
import { X, ShoppingBag, Loader2, Trash2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

export default function PublicCartSheet({ open, onClose, cart, setCart, tenant, table, currency, gradientStyle, onOrderPlaced }) {
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);

  const subtotal = cart.reduce((s, i) => s + i.total, 0);

  const updateQty = (productId, delta) => {
    setCart(prev => {
      const item = prev.find(i => i.productId === productId);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter(i => i.productId !== productId);
      return prev.map(i => i.productId === productId
        ? { ...i, quantity: newQty, total: newQty * i.unitPrice }
        : i
      );
    });
  };

  const placeOrder = async () => {
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      const supabase = await getSupabase();
      const orderNumber = `ORD-${Date.now()}`;
      const items = cart.map(i => ({
        product_id: i.productId,
        product_name: i.name,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        total: i.total,
        image_url: i.image_url || null,
      }));

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenant.id,
          table_id: table.id,
          table_name: table.name,
          order_number: orderNumber,
          status: 'pending',
          type: 'dine_in',
          items,
          subtotal,
          total_amount: subtotal,
          tax_amount: 0,
          payment_status: 'unpaid',
          payment_method: 'pending',
          customer_name: customerName.trim() || null,
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;
      onOrderPlaced(order);
    } catch (err) {
      alert('Failed to place order: ' + err.message);
    } finally {
      setPlacing(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white rounded-t-3xl max-h-[90vh]" style={{ maxWidth: 672, margin: '0 auto' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-slate-700" />
            <h2 className="font-bold text-slate-900 text-base">Your Order</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {cart.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">Your cart is empty</p>
          ) : (
            cart.map(item => (
              <div key={item.productId} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-300 text-lg">🍽</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">{currency} {item.unitPrice.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl overflow-hidden">
                  <button onClick={() => updateQty(item.productId, -1)} className="w-8 h-8 flex items-center justify-center text-slate-600 font-bold active:bg-slate-200">−</button>
                  <span className="w-6 text-center text-sm font-bold text-slate-800">{item.quantity}</span>
                  <button onClick={() => updateQty(item.productId, 1)} className="w-8 h-8 flex items-center justify-center text-white font-bold active:opacity-80 rounded-xl" style={{ background: gradientStyle }}>+</button>
                </div>
                <p className="text-sm font-bold text-slate-800 w-16 text-right">{currency} {item.total.toFixed(2)}</p>
              </div>
            ))
          )}

          {/* Name + Notes */}
          {cart.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Your name (optional)</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. John"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-slate-50 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Special instructions (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. No onions, extra sauce..."
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-slate-50 focus:bg-white transition-colors resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-100 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total</span>
              <span className="text-xl font-bold text-slate-900">{currency} {subtotal.toFixed(2)}</span>
            </div>
            <button
              onClick={placeOrder}
              disabled={placing}
              className="w-full h-14 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform disabled:opacity-70"
              style={{ background: gradientStyle }}
            >
              {placing ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {placing ? 'Placing order...' : 'Place Order'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}