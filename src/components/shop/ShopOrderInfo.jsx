import React from 'react';
import { Phone, MessageCircle, Truck, Store, CalendarDays, MapPin } from 'lucide-react';
import { formatShopDate, shopMethod, whatsappLink } from '@/lib/shopSelling';

// A free-shop order's details on the owner's order card: how the buyer gets it,
// the date, the buyer and how to reach them, the address and the delivery charge.
export function ShopMethodBadge({ order }) {
  const method = shopMethod(order);
  const Icon = method === 'delivery' ? Truck : Store;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium" data-testid="shop-method-badge">
      <Icon className="w-3 h-3" /> {method === 'delivery' ? 'Delivery' : 'Self-collect'}
    </span>
  );
}

export default function ShopOrderInfo({ order, currency, shopName }) {
  const f = order.fulfilment || {};
  const method = shopMethod(order);
  const name = order.customer_name && order.customer_name.toLowerCase() !== 'nil' ? order.customer_name : null;
  const phone = order.customer_phone || null;
  const fee = Number(f.fee) || 0;
  const stop = (e) => e.stopPropagation();
  const waText = `Hi${name ? ` ${name}` : ''}, this is ${shopName || 'the shop'} about your order #${order.order_number || ''}.`;

  return (
    <div className="mb-2 space-y-1 text-xs text-slate-600" data-testid="shop-order-info">
      {f.date && (
        <p className="flex items-center gap-1 font-semibold text-slate-800"><CalendarDays className="w-3.5 h-3.5" /> For {formatShopDate(f.date)}</p>
      )}
      {(name || phone) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800">{name || 'Buyer'}</span>
          {phone && <span className="text-slate-500">{phone}</span>}
          {phone && (
            <>
              <a href={`tel:${phone}`} onClick={stop} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-700" aria-label="Call the buyer">
                <Phone className="w-3 h-3" /> Call
              </a>
              <a href={whatsappLink(phone, waText)} onClick={stop} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700" aria-label="WhatsApp the buyer">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            </>
          )}
        </div>
      )}
      {!name && !phone && <p className="text-slate-400">No contact details (placed before checkout asked for them).</p>}
      {method === 'delivery' && f.address && (
        <p className="flex items-start gap-1"><MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {f.address}</p>
      )}
      {method === 'delivery' && (
        <p>Delivery: {f.fee_mode === 'extra' ? (fee > 0 ? `${currency} ${fee.toFixed(2)}` : 'free (order above the free-delivery amount)') : 'included in prices'}</p>
      )}
      {method === 'collection' && f.area && <p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Collect at {f.area}</p>}
    </div>
  );
}
