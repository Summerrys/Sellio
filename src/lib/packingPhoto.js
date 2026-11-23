// Packing photo (Alvin, 23–24 Nov 2026): a home seller's order whose buyer has a handover QR is
// marked packed (ready for collection / out for delivery) only with a photo of it packed, taken
// in Sellio's own camera with the order number written on the parcel or a note in the picture.
// Sellio stamps the photo with the order number, the shop and the time, uploads it to the private
// order-photos bucket (<shop>/<order>/<uuid>.jpg: only the shop's team with orders.edit can add
// one, for an accepted order still to hand over, and nobody can change or remove one), and
// shop_packing_photo records it (who, when, its size) and moves the order on in one go. The buyer
// sees it in My purchases. Until it has a photo, the server refuses the order's step to ready or
// completed, and its QR scan says not_packed (supabase/migrations/20261123171724_packing_photo.sql).
import { getSupabase } from '@/lib/supabaseClient';
import { N_ } from '@/lib/appText';

export const PHOTO_BUCKET = 'order-photos';
// A photo's longest side, and its JPEG quality: an order number written on a parcel stays sharp
// (about 300–600 KB; the bucket takes up to 5 MB).
export const LONG_SIDE = 1600;
const QUALITY = 0.82;

// The server's refusal of a step to ready or completed without a photo (and its words, for the
// screens that show it as it is, e.g. the kitchen screen).
export const PACKING_REQUIRED = 'packing_photo_required';
export const PACKING_REQUIRED_TEXT = N_('Take the packing photo to mark this order packed.');

// shop_packing_photo's reasons, in the seller's words.
export const PACKING_REASONS = {
  unknown: N_('This order isn’t in your shop any more.'),
  not_needed: N_('This order doesn’t need a packing photo.'),
  cancelled: N_('Order #{number} was cancelled.'),
  already_completed: N_('Order #{number} is already completed.'),
  not_accepted: N_('Accept order #{number} first.'),
  bad_photo: N_('That photo isn’t for this order. Take it again.'),
  photo_missing: N_('The photo didn’t arrive. Take it again.'),
  photo_old: N_('That photo was taken too long ago. Take a new one.'),
};

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Where an order's photo goes: the shop's folder, the order's folder, a new name (the storage
// rules accept only this shape).
export const packingPath = (tenantId, orderId) => `${tenantId}/${orderId}/${uuid()}.jpg`;

async function rpc(name, args) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// The photo (a JPEG Blob) into the order's folder; its path.
export async function uploadPackingPhoto(tenantId, orderId, blob) {
  const supabase = await getSupabase();
  const path = packingPath(tenantId, orderId);
  const { error } = await supabase.storage.from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

// Recorded and the order moved on: { ok, order_id, order_number, status, path, taken_at,
// taken_by_name } (already: true for the same photo again), or { ok: false, reason }.
export const recordPackingPhoto = (tenantId, orderId, path) => rpc('shop_packing_photo', {
  p_tenant_id: tenantId, p_order_id: orderId, p_path: path,
});

// The shop: each order's latest photo ({ path, taken_at, taken_by_name, photos }), by order id.
export async function fetchShopPackingPhotos(tenantId, orderIds) {
  const ids = [...new Set((orderIds || []).filter(Boolean))].slice(0, 500);
  if (!tenantId || !ids.length) return {};
  const rows = await rpc('shop_packing_photos', { p_tenant_id: tenantId, p_order_ids: ids });
  const out = {};
  for (const row of rows || []) out[row.order_id] = row;
  return out;
}

// The buyer: their order's photo ({ path, taken_at }), or null.
export const fetchMyPackingPhoto = (orderId) => rpc('my_packing_photo', { p_order_id: orderId });

// Links to show photos (the bucket is private: each link works for an hour), by path.
export async function photoLinks(paths, seconds = 3600) {
  const list = [...new Set((paths || []).filter(Boolean))];
  if (!list.length) return {};
  const supabase = await getSupabase();
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list, seconds);
  if (error) throw error;
  const out = {};
  for (const row of data || []) if (row?.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

// The stamp along the photo's foot: "ORD-000012 · Ann Bakes · 24 Nov 2026, 9:52 pm".
export function stampText({ orderNumber, shopName, at = new Date(), locale }) {
  const time = at.toLocaleString(locale || undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return [orderNumber, String(shopName || '').trim(), time].filter(Boolean).join(' · ');
}

// The photo's size: the camera's picture scaled down to LONG_SIDE on its longest side.
export function photoSize(width, height, longSide = LONG_SIDE) {
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const h = Math.max(1, Math.floor(Number(height) || 0));
  const scale = Math.min(1, longSide / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// The camera's picture now (a <video> playing it), stamped: a JPEG Blob, or null where the
// browser can't draw it.
export function stampedPhoto(video, stamp, doc = typeof document !== 'undefined' ? document : null) {
  return new Promise((resolve) => {
    const source = { width: video?.videoWidth, height: video?.videoHeight };
    if (!doc || !source.width || !source.height) { resolve(null); return; }
    const size = photoSize(source.width, source.height);
    const canvas = doc.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) { resolve(null); return; }
    context.drawImage(video, 0, 0, size.width, size.height);
    // A dark band along the foot, the stamp in white on it: readable on any parcel.
    const font = Math.max(16, Math.round(size.width / 34));
    const band = Math.round(font * 2.1);
    context.fillStyle = 'rgba(0, 0, 0, 0.62)';
    context.fillRect(0, size.height - band, size.width, band);
    context.fillStyle = '#ffffff';
    context.font = `600 ${font}px -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    context.textBaseline = 'middle';
    context.fillText(String(stamp || ''), Math.round(font * 0.7), size.height - band / 2, size.width - Math.round(font * 1.4));
    if (typeof canvas.toBlob !== 'function') { resolve(null); return; }
    canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', QUALITY);
  });
}
