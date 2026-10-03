import React, { useEffect, useMemo, useState } from 'react';
import {
  availableMethods, deliveryChargeFor, formatShopDate, normaliseBuyerPhone, shopT, buyerStatusLabel,
  shopMethod, whatsappLink,
} from '@/lib/shopSelling';

// Free-shop parts of the store page: checkout (how to get the order, name, mobile,
// address, date), the details shown after ordering, and the buyer's order history.
// The store page uses these only when get_shop_selling returns settings (free shops).

const BUYER_KEY = 'sellio_buyer_details';
const readBuyer = () => {
  try { return JSON.parse(localStorage.getItem(BUYER_KEY) || '{}') || {}; } catch { return {}; }
};
const saveBuyer = (details) => {
  try { localStorage.setItem(BUYER_KEY, JSON.stringify(details)); } catch { /* optional */ }
};

const labelStyle = { fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 15, outline: 'none', boxSizing: 'border-box', background: 'white' };
const money = (sym, n) => `${sym}${Number(n || 0).toFixed(2)}`;

export function ShopCheckout({ selling, cartTotal, sym, primaryColor, lang, isSubmitting, isStoreOpen, closedText, placeText, placingText, onSubmit }) {
  const methods = useMemo(() => availableMethods(selling), [selling]);
  const saved = useMemo(readBuyer, []);
  const [method, setMethod] = useState(methods.includes(saved.method) ? saved.method : methods[0]);
  const [name, setName] = useState(saved.name || '');
  const [phone, setPhone] = useState(saved.phone || '');
  const [address, setAddress] = useState(saved.address || '');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const T = (k) => shopT(lang, k);

  useEffect(() => { if (!methods.includes(method)) setMethod(methods[0]); }, [methods, method]);

  const fee = method === 'delivery' ? deliveryChargeFor(selling, cartTotal) : 0;
  const total = Number(cartTotal) + fee;
  const pre = selling?.preorder?.enabled ? selling.preorder : null;
  const d = selling?.delivery || {};
  const c = selling?.collection || {};

  const submit = () => {
    setError('');
    if (!name.trim()) { setError(T('nameNeeded')); return; }
    const normalised = normaliseBuyerPhone(phone);
    if (!normalised) { setError(T('phoneNeeded')); return; }
    if (method === 'delivery' && address.trim().length < 5) { setError(T('addressNeeded')); return; }
    if (pre && !date) { setError(T('dateNeeded')); return; }
    saveBuyer({ name: name.trim(), phone, address: method === 'delivery' ? address : saved.address || '', method });
    onSubmit({ method, name: name.trim(), phone: normalised, address: method === 'delivery' ? address.trim() : null, date: pre ? date : null, notes: notes.trim() || null });
  };

  const choice = (value, title, detail) => (
    <button
      key={value}
      type="button"
      onClick={() => setMethod(value)}
      disabled={isSubmitting}
      data-testid={`shop-method-${value}`}
      style={{
        flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
        border: method === value ? `2px solid ${primaryColor}` : '1px solid #e5e7eb',
        background: method === value ? `${primaryColor}10` : 'white',
      }}
    >
      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</span>
      {detail && <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 }}>{detail}</span>}
    </button>
  );

  const deliveryDetail = d.fee_mode === 'extra' && Number(d.fee) > 0 ? money(sym, d.fee) : T('deliveryIncluded');

  return (
    <div data-testid="shop-checkout">
      <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>{T('howToGet')}</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {methods.includes('collection') && choice('collection', T('collection'), c.area || null)}
        {methods.includes('delivery') && choice('delivery', T('delivery'), deliveryDetail)}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '8px 10px', marginBottom: 14, lineHeight: 1.5 }}>
        {method === 'collection' ? (
          <>
            {c.area && <div><strong>{T('collectionAt')}:</strong> {c.area}</div>}
            <div>{T('addressAfterAccept')}</div>
            {c.notes && <div>{c.notes}</div>}
          </>
        ) : (
          <>
            <div>{d.fee_mode === 'extra' && Number(d.fee) > 0 ? `${T('deliveryFee')}: ${money(sym, d.fee)}` : T('deliveryIncluded')}</div>
            {d.fee_mode === 'extra' && d.free_above != null && <div>{T('freeAbove')} {money(sym, d.free_above)}</div>}
            {d.areas && <div><strong>{T('deliversTo')}:</strong> {d.areas}</div>}
            {d.notes && <div>{d.notes}</div>}
          </>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={labelStyle} htmlFor="shop-name">{T('yourName')}</label>
          <input id="shop-name" style={inputStyle} value={name} maxLength={60} autoComplete="name" disabled={isSubmitting} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="shop-phone">{T('yourMobile')}</label>
          <input id="shop-phone" style={inputStyle} value={phone} inputMode="tel" autoComplete="tel" placeholder="9123 4567" disabled={isSubmitting} onChange={e => setPhone(e.target.value)} />
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>{T('mobileHint')}</p>
        </div>
        {method === 'delivery' && (
          <div>
            <label style={labelStyle} htmlFor="shop-address">{T('deliveryAddress')}</label>
            <textarea id="shop-address" style={{ ...inputStyle, resize: 'none' }} rows={2} maxLength={300} autoComplete="street-address" value={address} disabled={isSubmitting} onChange={e => setAddress(e.target.value)} />
          </div>
        )}
        {pre && (
          <div>
            <label style={labelStyle} htmlFor="shop-date">{T('pickDate')}</label>
            <input id="shop-date" type="date" style={inputStyle} min={pre.earliest} max={pre.latest} value={date} disabled={isSubmitting} onChange={e => setDate(e.target.value)} />
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>{T('pickDateHint')} {formatShopDate(pre.earliest)}</p>
          </div>
        )}
        <div>
          <label style={labelStyle} htmlFor="shop-notes">{T('notes')}</label>
          <textarea id="shop-notes" style={{ ...inputStyle, resize: 'none' }} rows={2} maxLength={1000} placeholder={T('notesPlaceholder')} value={notes} disabled={isSubmitting} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <div style={{ borderTop: '0.5px solid #e5e7eb', paddingTop: 10, marginBottom: 14, fontSize: 13, color: '#475569' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{T('subtotal')}</span><span>{money(sym, cartTotal)}</span></div>
        {method === 'delivery' && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }} data-testid="shop-fee-line">
            <span>{T('delivery')}</span>
            <span>{d.fee_mode === 'extra' ? (fee > 0 ? money(sym, fee) : T('free')) : T('included')}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, color: '#0f172a', marginTop: 4 }}>
          <span>{T('total')}</span><span style={{ color: primaryColor }} data-testid="shop-total">{money(sym, total)}</span>
        </div>
      </div>

      {error && <p role="alert" style={{ color: '#dc2626', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}

      {!isStoreOpen ? (
        <div style={{ width: '100%', padding: 14, background: '#f1f5f9', color: '#94a3b8', borderRadius: 12, fontSize: 15, fontWeight: 600, textAlign: 'center' }}>
          🔒 {closedText}
        </div>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={isSubmitting}
          data-testid="shop-place-order"
          style={{ width: '100%', padding: 14, background: isSubmitting ? '#94a3b8' : primaryColor, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
        >
          {isSubmitting ? (placingText || '…') : `${placeText || shopT(lang, 'yourOrder')} · ${money(sym, total)}`}
        </button>
      )}
    </div>
  );
}

// How the buyer gets the order: shown after ordering and in the order history.
export function ShopOrderDetails({ order, sym, lang, food, sellerPhone }) {
  const f = order?.fulfilment || {};
  const method = shopMethod(order);
  const T = (k) => shopT(lang, k);
  const fee = Number(f.fee) || 0;
  return (
    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }} data-testid="shop-order-details">
      <div><strong>{method === 'delivery' ? T('delivery') : T('collection')}</strong>{f.date ? ` · ${T('for')} ${formatShopDate(f.date)}` : ''}</div>
      {method === 'delivery' && f.address && <div>{f.address}</div>}
      {method === 'collection' && (
        f.collection_address
          ? <div data-testid="shop-collection-address">{T('collectionAt')}: {f.collection_address}</div>
          : <div>{f.area ? `${T('collectionAt')}: ${f.area}. ` : ''}{T('addressAfterAccept')}</div>
      )}
      {f.seller_notes && <div style={{ color: '#64748b' }}>{f.seller_notes}</div>}
      {method === 'delivery' && (
        <div style={{ color: '#64748b' }}>{T('delivery')}: {f.fee_mode === 'extra' ? (fee > 0 ? money(sym, fee) : T('free')) : T('included')}</div>
      )}
      {order?.status && (
        <div style={{ color: '#64748b' }}>{buyerStatusLabel(lang, order.status, method, food)}</div>
      )}
      {sellerPhone && (
        <a href={whatsappLink(sellerPhone, `Order #${order?.order_number || ''}`)} target="_blank" rel="noreferrer" style={{ color: '#16a34a', fontWeight: 600 }}>
          {T('contactSeller')}
        </a>
      )}
    </div>
  );
}

const STATUS_STYLE = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  confirmed: { bg: '#dbeafe', color: '#1e40af' },
  preparing: { bg: '#ede9fe', color: '#5b21b6' },
  ready: { bg: '#d1fae5', color: '#065f46' },
  served: { bg: '#d1fae5', color: '#065f46' },
  completed: { bg: '#f1f5f9', color: '#475569' },
  cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

export function ShopOrderHistory({ orders, sym, lang, food, primaryColor, paymentQrUrl }) {
  const T = (k) => shopT(lang, k);
  const [qrFor, setQrFor] = useState(null);
  if (!orders.length) {
    return <div style={{ textAlign: 'center', padding: '32px 0' }}><p style={{ color: '#94a3b8', fontSize: 14 }}>{T('noOrders')}</p></div>;
  }
  return orders.map(order => {
    const method = shopMethod(order);
    const style = STATUS_STYLE[order.status] || STATUS_STYLE.pending;
    const unpaid = order.payment_status !== 'paid' && order.status !== 'cancelled';
    return (
      <div key={order.id} data-testid="shop-history-order" style={{ marginBottom: 14, padding: 14, background: '#f8fafc', borderRadius: 12, border: '0.5px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>#{order.order_number}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{new Date(order.created_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <span data-testid="shop-history-status" style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: style.bg, color: style.color }}>
            {buyerStatusLabel(lang, order.status, method, food)}
          </span>
        </div>
        {(order.items || []).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 2 }}>
            <span>{item.name}{item.variant ? ` (${item.variant})` : ''} × {item.quantity}</span>
            <span style={{ fontWeight: 600 }}>{money(sym, item.price * item.quantity)}</span>
          </div>
        ))}
        <div style={{ margin: '8px 0' }}><ShopOrderDetails order={{ ...order, status: null }} sym={sym} lang={lang} food={food} /></div>
        <div style={{ borderTop: '0.5px solid #e5e7eb', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 13 }}>
          <span>{T('total')} <span style={{ fontWeight: 500, fontSize: 11, color: order.payment_status === 'paid' ? '#16a34a' : '#b45309' }}>· {order.payment_status === 'paid' ? T('paid') : T('notPaid')}</span></span>
          <span style={{ color: primaryColor }}>{money(sym, order.total_amount)}</span>
        </div>
        {unpaid && paymentQrUrl && (
          qrFor === order.id
            ? <img src={paymentQrUrl} alt="Payment QR" style={{ width: 180, height: 180, objectFit: 'contain', display: 'block', margin: '10px auto 0', background: 'white', borderRadius: 10, padding: 8, border: '1px solid #e2e8f0' }} />
            : <button type="button" onClick={() => setQrFor(order.id)} style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: primaryColor, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{T('showQr')}</button>
        )}
      </div>
    );
  });
}
