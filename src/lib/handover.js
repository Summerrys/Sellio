// Handover QR (Alvin, 23 Nov 2026): every home seller's order gets a QR from the server when it's
// placed. The buyer shows it when they collect the order (or when it's delivered); the seller scans
// it in Orders, and that scan is what marks the order collected / delivered. It is there so a buyer
// can't say "I never got it" when they did: the server keeps when the QR was issued, when the
// buyer's phone showed it, and when and by whom it was scanned
// (supabase/migrations/20261123094152_handover_qr.sql). The QR and its 6-digit code come from the
// server each time they're shown (nothing is kept on the phone), and only to the account that
// placed the order; the shop never sees them, it only sends what its scanner read. For a delivery
// the seller can send the courier they arranged a one-time link (sellio.sg/courier/…): the courier
// scans the buyer's QR on that page, for that order only (pages/CourierHandover.jsx).
import { getSupabase } from '@/lib/supabaseClient';
import { SITE } from '@/lib/pageMeta';

const TOKEN = /^[0-9a-f]{32}$/;
const PIN = /^\d{6}$/;

// What the QR says: a sellio.sg link, so a phone's own camera app opens the seller's Orders on it
// (Orders.jsx picks up ?qr=). Sellio's scanner reads the token straight from it. Short, so the QR
// stays small and quick to read.
export const handoverLink = (token) => `${SITE}/Orders?qr=${token}`;

// The token in a scanned QR (the link above, or the bare token); null for any other QR.
export function tokenFromScan(text) {
  const raw = String(text || '').trim();
  if (TOKEN.test(raw.toLowerCase())) return raw.toLowerCase();
  try {
    const url = new URL(raw);
    if (!/(^|\.)sellio\.sg$/i.test(url.hostname) && url.hostname !== 'localhost') return null;
    const value = String(url.searchParams.get('qr') || '').toLowerCase();
    return TOKEN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export const cleanPin = (value) => String(value || '').replace(/\D/g, '').slice(0, 6);
// 482913 → "482 913", easier to read out.
export const spacedPin = (pin) => (PIN.test(pin || '') ? `${pin.slice(0, 3)} ${pin.slice(3)}` : '');

// A home seller's order (only theirs have QRs for now).
export const isHomeOrder = (order, tenant) => (tenant ? tenant.seller_type === 'individual' : order?.shop_type === 'individual');
export const handoverMethod = (order) => (order?.fulfilment?.method === 'delivery' || (!order?.fulfilment?.method && order?.type === 'delivery') ? 'delivery' : 'collection');

async function rpc(name, args) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// The buyer's QR for their order, from the server: { token, pin, issued_at, status } while it's
// still to be handed over; { status, verified_at, verified_via } once the seller scanned it; null
// when it isn't theirs (or was placed signed out).
export const fetchMyHandover = (orderId) => rpc('my_handover', { p_order_id: orderId });

// The shop: whether each order's buyer has a QR (never the QR), until when its code waits after
// wrong tries, the record (issued, shown on the buyer's phone, verified when / how / by whom, by a
// courier), and the courier link while it works, by order id.
export async function fetchShopHandovers(tenantId, orderIds) {
  const ids = [...new Set((orderIds || []).filter(Boolean))].slice(0, 500);
  if (!tenantId || !ids.length) return {};
  const rows = await rpc('shop_handovers', { p_tenant_id: tenantId, p_order_ids: ids });
  const out = {};
  for (const row of rows || []) out[row.order_id] = row;
  return out;
}

// The seller's scanner read a buyer's QR: verified, recorded and completed on the server in one go.
// Answers { ok, reason, order_id, order_number, method, customer_name, items, verified_at, … }.
export const scanHandover = (tenantId, token) => rpc('shop_handover_scan', { p_tenant_id: tenantId, p_token: token });

// The buyer's 6-digit code typed for their order (when the QR can't be shown or read). Every 5th
// wrong code makes it wait 5 minutes ({ reason: 'paused', paused_until }); the QR still works.
export const pinHandover = (tenantId, orderId, pin) => rpc('shop_handover_pin', { p_tenant_id: tenantId, p_order_id: orderId, p_pin: pin });

// ── The courier link ─────────────────────────────────────────────────────────────────────────
// The page a courier opens: no Sellio account needed. The link opens one order, once, for 24 hours.
export const courierLinkUrl = (link) => `${SITE}/courier/${link}`;
// The shop makes one (replacing the last), optionally with the courier's name, or stops it.
export const makeCourierLink = (tenantId, orderId, courierName) => rpc('shop_courier_link', {
  p_tenant_id: tenantId, p_order_id: orderId, p_courier_name: courierName || null, p_stop: false,
});
export const stopCourierLink = (tenantId, orderId) => rpc('shop_courier_link', {
  p_tenant_id: tenantId, p_order_id: orderId, p_courier_name: null, p_stop: true,
});
// The courier's page: { ok, shop_name, order_number, method, courier_name, expires_at, paused_until }
// while the link works, else { reason: 'invalid' }. Nothing about the buyer.
export const fetchCourierHandover = (link) => rpc('courier_handover', { p_link: link });
// The courier scanned the buyer's QR, or typed their code: { ok, order_number, method, verified_at,
// verified_via }, or a reason (not_this_order, wrong_pin, paused, invalid, cancelled…).
export const courierScan = (link, token) => rpc('courier_handover_scan', { p_link: link, p_token: token });
export const courierPin = (link, pin) => rpc('courier_handover_pin', { p_link: link, p_pin: pin });
// A courier link's code in a sellio.sg/courier/… address (the route's own parameter).
export const COURIER_LINK = /^[0-9a-f]{32}$/;
