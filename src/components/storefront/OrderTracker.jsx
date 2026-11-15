import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

// "Order placed!": where the order is now and what to do next (UX state 10, 15 Nov 2026).
// The status is checked again every 5 seconds while the page is on screen (and as soon as it
// comes back to the front), by the order's id kept on this phone: the same functions as the
// store page's Your orders (get_storefront_orders for a shop's menu, get_shop_orders for a home
// shop), so a guest can follow it too. It stops once the order is done or cancelled.
const POLL_MS = 5000;
const FINAL = new Set(['served', 'completed', 'cancelled']);
// The furthest step each status has reached: Sent, Accepted, Preparing (Packing), Ready.
const REACHED = { pending: 0, confirmed: 1, preparing: 2, ready: 3, served: 3, completed: 3 };

export function useOrderStatus({ tenantId, orderId, initial = 'pending', homeShop = false, every = POLL_MS }) {
  const [status, setStatus] = useState(initial || 'pending');
  useEffect(() => {
    if (!tenantId || !orderId) return undefined;
    let stopped = false;
    let timer = null;
    let current = initial || 'pending';
    const check = async () => {
      if (stopped || FINAL.has(current) || document.visibilityState === 'hidden') return;
      try {
        const supabase = await getSupabase();
        const { data } = await supabase.rpc(homeShop ? 'get_shop_orders' : 'get_storefront_orders', { p_tenant_id: tenantId, p_order_ids: [orderId] });
        const next = Array.isArray(data) ? data.find((row) => row?.id === orderId)?.status : null;
        if (!stopped && next && next !== current) { current = next; setStatus(next); }
      } catch {
        // no connection: the next check tries again
      }
    };
    const loop = () => {
      timer = setTimeout(async () => {
        await check();
        if (!stopped && !FINAL.has(current)) loop();
      }, every);
    };
    const backOnScreen = () => { if (document.visibilityState === 'visible') check(); };
    loop();
    document.addEventListener('visibilitychange', backOnScreen);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', backOnScreen);
    };
  }, [tenantId, orderId, homeShop, every]);
  return status;
}

const fill = (text, values) => String(text).replace(/\{(\w+)\}/g, (whole, name) => (values[name] != null ? String(values[name]) : whole));

// What the buyer reads for a status. kind: 'table' (eating in), 'counter' (takeaway from a
// shop's menu), 'collection' or 'delivery' (a home shop's order); packing: a home shop's goods.
export function orderStatusLine(status, { kind, packing = false, shopName = '', tableName = '', orderNumber = '' }, t) {
  const values = { shop: shopName || t('theShop'), table: tableName, number: `#${orderNumber}` };
  switch (status) {
    case 'confirmed': return fill(t('statusAccepted'), values);
    case 'preparing': return t(packing ? 'statusPacking' : 'statusPreparing');
    case 'ready':
    case 'served':
      if (kind === 'table') return status === 'served' ? t('statusServed') : fill(t('statusReadyTable'), values);
      if (kind === 'delivery') return t('statusOutForDelivery');
      if (kind === 'collection') return t('statusReadyCollection');
      return fill(t('statusReadyCounter'), values);
    case 'completed':
      if (kind === 'delivery') return t('statusDelivered');
      if (kind === 'collection') return t('statusCollected');
      return t('statusCompleted');
    case 'cancelled': return t('statusCancelled');
    default: return fill(t('statusWaiting'), values);
  }
}

export default function OrderTracker({ tenantId, order, homeShop = false, kind, packing = false, shopName, tableName, t, primaryColor, every }) {
  const status = useOrderStatus({ tenantId, orderId: order?.id, initial: order?.status, homeShop, every });
  const cancelled = status === 'cancelled';
  const reached = REACHED[status] ?? 0;
  const live = !FINAL.has(status);
  const steps = [t('stepSent'), t('stepAccepted'), t(packing ? 'stepPacking' : 'stepPreparing'), t('stepReady')];
  const ready = !cancelled && reached === 3;
  return (
    <div data-testid="order-tracker" data-status={status} style={{ width: '100%', background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '14px 16px 16px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '0.02em', textTransform: 'uppercase' }}>{t('orderStatus')}</p>
      {!cancelled && (
        <ol aria-label={t('orderStatus')} style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', position: 'relative' }}>
          {steps.map((label, index) => {
            const done = index <= reached;
            const current = index === reached;
            return (
              <li key={label} aria-current={current ? 'step' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', minWidth: 0 }}>
                {index > 0 && (
                  <span aria-hidden="true" style={{ position: 'absolute', top: 11, right: '50%', width: '100%', height: 2, background: index <= reached ? primaryColor : '#e2e8f0', zIndex: 0 }} />
                )}
                <span aria-hidden="true" style={{ position: 'relative', zIndex: 1, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? primaryColor : 'white', border: `2px solid ${done ? primaryColor : '#e2e8f0'}` }}>
                  {done && <Check size={13} color="white" strokeWidth={3} />}
                </span>
                <span style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.25, textAlign: 'center', fontWeight: current ? 700 : 500, color: done ? '#0f172a' : '#94a3b8', padding: '0 2px', overflowWrap: 'anywhere' }}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p
        data-testid="order-tracker-line"
        role="status"
        aria-live="polite"
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.5,
          fontWeight: 600,
          color: cancelled ? '#991b1b' : ready ? '#065f46' : '#0f172a',
          ...(cancelled || ready ? { background: cancelled ? '#fee2e2' : '#d1fae5', borderRadius: 10, padding: '10px 12px' } : {}),
        }}
      >
        {orderStatusLine(status, { kind, packing, shopName, tableName, orderNumber: order?.order_number }, t)}
      </p>
      {live && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94a3b8' }}>{t('updatesHere')}</p>}
    </div>
  );
}
