import { getSupabase } from '@/lib/supabaseClient';

// "My purchases": the signed-in buyer's orders from every shop (Supabase: my_purchases,
// my_purchase_summary, cancel_my_order, claim_my_orders). An order is theirs when it
// was placed while signed in, or added from this phone later (claimDeviceOrders).

export const ONGOING = ['pending', 'confirmed', 'preparing', 'ready', 'served'];

async function rpc(name, args) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// box: 'ongoing' | 'past'.
export const fetchPurchases = (box, offset = 0, limit = 20) =>
  rpc('my_purchases', { p_box: box, p_limit: limit, p_offset: offset }).then((rows) => rows || []);

export const fetchPurchase = (orderId) =>
  rpc('my_purchases', { p_order_id: orderId }).then((rows) => (rows || [])[0] || null);

export async function purchaseSummary() {
  const rows = await rpc('my_purchase_summary', {});
  return (Array.isArray(rows) ? rows[0] : rows) || { ongoing: 0, total: 0 };
}

export class PurchaseError extends Error {
  constructor(message, hint) { super(message); this.hint = hint || null; }
}

export async function cancelMyOrder(orderId) {
  try {
    return await rpc('cancel_my_order', { p_order_id: orderId });
  } catch (e) {
    throw new PurchaseError(e?.message || 'Couldn’t cancel the order. Please try again.', e?.hint);
  }
}

// Orders this phone placed on shop pages while signed out: their ids are kept per shop
// (sf_session_orders_<shop>_<table>) with the phone's id (sellio_device_id).
export function deviceOrders() {
  const ids = new Set();
  let deviceId = null;
  try {
    deviceId = localStorage.getItem('sellio_device_id');
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('sf_session_orders_')) continue;
      try {
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(list)) list.forEach((id) => { if (typeof id === 'string' && id) ids.add(id); });
      } catch { /* one bad entry */ }
    }
  } catch { /* storage unavailable */ }
  return { deviceId, orderIds: [...ids].slice(-100) };
}

// apply false: how many of them can be added to this account; true: add them.
export async function claimDeviceOrders(apply = false) {
  const { deviceId, orderIds } = deviceOrders();
  if (!deviceId || !orderIds.length) return 0;
  const n = await rpc('claim_my_orders', { p_device_id: deviceId, p_order_ids: orderIds, p_apply: apply });
  return Number(n) || 0;
}
