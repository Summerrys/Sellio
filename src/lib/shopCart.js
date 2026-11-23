import { useEffect, useState } from 'react';

// Buyers' carts on this device, one per shop. They are the shop pages' own carts
// (localStorage "sf_cart_<shop's link name>", see Storefront.jsx), so an item added on
// an Explore listing is in that shop's cart when its page opens, and the other way round.
// (A table's order, staff taking an order and the owner's preview keep carts of their own,
// under other names, so they never show here.)
// A line is built exactly as the shop page's addToCart builds it:
//   { key, product_id, name, price, image_url, quantity, variant, notes }
// Prices here are only for showing: checkout (place_order) prices every item itself.
// Lines the shop page wrote are kept as they are; only the line being changed is touched.

const PREFIX = 'sf_cart_';
// Each shop's name, logo and currency (for the Cart page before the shop's details
// arrive) and when something was last added from Explore (newest shop first).
const SHOPS_KEY = 'sellio_cart_shops';
export const CART_EVENT = 'sellio:carts';
export const MAX_LINE_QUANTITY = 99;

export const cartStorageKey = (slug) => `${PREFIX}${slug}`;

// The shop page's line key: the same item with the same options and note is one line.
export function cartLineKey(productId, variant, notes) {
  return `${productId}-${variant?.label || 'default'}${notes ? `-${notes}` : ''}`;
}

function store() {
  try { return window.localStorage; } catch { return null; }
}

function readRaw(slug) {
  const s = store();
  if (!s || !slug) return [];
  try {
    const lines = JSON.parse(s.getItem(cartStorageKey(slug)) || '[]');
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
}

const usable = (line) => !!line && typeof line === 'object' && line.key != null && Number(line.quantity) > 0;

function notify() {
  try { window.dispatchEvent(new Event(CART_EVENT)); } catch { /* nothing listening */ }
}

function write(slug, lines) {
  const s = store();
  if (!s || !slug) return false;
  try {
    if (lines.length) s.setItem(cartStorageKey(slug), JSON.stringify(lines));
    else s.removeItem(cartStorageKey(slug));
  } catch {
    return false;
  }
  notify();
  return true;
}

function readShops() {
  const s = store();
  if (!s) return {};
  try {
    const shops = JSON.parse(s.getItem(SHOPS_KEY) || '{}');
    return shops && typeof shops === 'object' && !Array.isArray(shops) ? shops : {};
  } catch {
    return {};
  }
}

function rememberShop(slug, shop) {
  const s = store();
  if (!s) return;
  const shops = readShops();
  shops[slug] = {
    ...(shops[slug] || {}),
    ...(shop?.name ? { name: String(shop.name) } : {}),
    ...(shop?.logo_url !== undefined ? { logo_url: shop.logo_url || null } : {}),
    ...(shop?.currency ? { currency: String(shop.currency) } : {}),
    touched: Date.now(),
  };
  // Shops with nothing in their cart any more are dropped.
  for (const other of Object.keys(shops)) {
    if (other !== slug && !readRaw(other).some(usable)) delete shops[other];
  }
  try { s.setItem(SHOPS_KEY, JSON.stringify(shops)); } catch { /* the Cart page asks the shop instead */ }
}

function newLine(product, variant, notes, quantity) {
  return {
    key: cartLineKey(product.id, variant, notes),
    product_id: product.id,
    name: product.name,
    price: (Number(product.price) || 0) + (Number(variant?.price_modifier) || 0),
    image_url: product.image_url || null,
    quantity,
    variant: variant?.label || null,
    notes: notes || null,
  };
}

const clampQuantity = (n) => Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.floor(Number(n) || 1)));
const lineQuantity = (line) => Math.max(0, Math.floor(Number(line?.quantity) || 0));

// ── Stock (Alvin, 23 Nov 2026) ─────────────────────────────────────────────────
// A buyer can't have more of an item than the seller has, when the seller counts its stock
// (Track stock on); an item without it ("unlimited") stops at MAX_LINE_QUANTITY. Stock is
// counted per item, so the limit covers all of the item's lines together (other options or
// notes). Unknown stock (not loaded, or no number set) is no limit below MAX_LINE_QUANTITY,
// the same as "Sold out" (tracked and exactly 0). Checkout doesn't check stock yet.
export function stockLimit(product) {
  if (!product || product.track_inventory !== true) return MAX_LINE_QUANTITY;
  const raw = product.stock_quantity;
  if (raw === null || raw === undefined || raw === '') return MAX_LINE_QUANTITY;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_LINE_QUANTITY, n)) : MAX_LINE_QUANTITY;
}

// How many of the item the cart's lines hold, leaving out the line `exceptKey` (null: none).
export function heldInCart(lines, productId, exceptKey = null) {
  return (lines || []).reduce((n, l) => (
    l && productId != null && l.product_id === productId && l.key !== exceptKey ? n + lineQuantity(l) : n
  ), 0);
}

// The most the line `key` can hold: the item's limit less its other lines.
export function lineRoom(lines, product, key) {
  return Math.max(0, stockLimit(product) - heldInCart(lines, product?.id, key));
}

// Returned by Add to cart (and Buy now for a new line) when none of the item fits any more:
// the seller has no more than the cart already holds. Truthy, as nothing went wrong.
export const CART_FULL = 'full';

// Add to cart: `quantity` more of the line, as many as the item's stock leaves room for.
// True once added; CART_FULL if none fits; false if this device can't keep it (storage
// blocked or full).
export function addToShopCart(slug, product, variant = null, notes = null, quantity = 1, shop = null) {
  if (!slug || !product?.id) return false;
  const qty = clampQuantity(quantity);
  const key = cartLineKey(product.id, variant, notes);
  const lines = readRaw(slug);
  const existing = lines.find(l => l?.key === key);
  const have = lineQuantity(existing);
  const most = Math.min(lineRoom(lines, product, key), have + qty);
  if (most <= have) return CART_FULL;
  const next = existing
    ? lines.map(l => (l?.key === key ? { ...l, quantity: most } : l))
    : [...lines, newLine(product, variant, notes, most)];
  if (!write(slug, next)) return false;
  rememberShop(slug, shop);
  return true;
}

// Buy now: the line is in the cart with at least `quantity`, or as many as the stock leaves
// room for (tapping Buy now on an item that is already in the cart doesn't add a second one).
// CART_FULL when the line is new and none fits.
export function ensureInShopCart(slug, product, variant = null, notes = null, quantity = 1, shop = null) {
  if (!slug || !product?.id) return false;
  const qty = clampQuantity(quantity);
  const key = cartLineKey(product.id, variant, notes);
  const lines = readRaw(slug);
  const existing = lines.find(l => l?.key === key);
  const want = Math.min(lineRoom(lines, product, key), qty);
  if (!existing && want < 1) return CART_FULL;
  const next = existing
    ? lines.map(l => (l?.key === key ? { ...l, quantity: Math.max(lineQuantity(l), want) } : l))
    : [...lines, newLine(product, variant, notes, want)];
  if (!write(slug, next)) return false;
  rememberShop(slug, shop);
  return true;
}

// The Cart page's − / + / remove (0 removes the line). `limit`: the item's stockLimit, when
// known. Fewer always works; more stops at what the stock leaves room for.
export function setShopCartQuantity(slug, key, quantity, limit = MAX_LINE_QUANTITY) {
  const lines = readRaw(slug);
  const n = Math.floor(Number(quantity) || 0);
  const line = lines.find(l => l?.key === key);
  if (n > 0 && !line) return true;
  if (n <= 0) return write(slug, lines.filter(l => l?.key !== key));
  const have = lineQuantity(line);
  const most = Math.max(0, Math.min(MAX_LINE_QUANTITY, limit) - heldInCart(lines, line.product_id, key));
  const next = n > have ? Math.max(have, Math.min(n, most)) : n;
  return write(slug, lines.map(l => (l?.key === key ? { ...l, quantity: next } : l)));
}

export function readShopCart(slug) {
  return readRaw(slug).filter(usable);
}

// Every shop with something in its cart, the one added to last from Explore first.
export function listShopCarts() {
  const s = store();
  if (!s) return [];
  const shops = readShops();
  const out = [];
  let keys = [];
  try {
    for (let i = 0; i < s.length; i += 1) keys.push(s.key(i));
  } catch {
    keys = [];
  }
  for (const k of keys) {
    if (!k || !k.startsWith(PREFIX)) continue;
    const slug = k.slice(PREFIX.length);
    const lines = readShopCart(slug);
    if (slug && lines.length) out.push({ slug, lines, shop: shops[slug] || null });
  }
  return out.sort((a, b) => ((b.shop?.touched || 0) - (a.shop?.touched || 0)) || a.slug.localeCompare(b.slug));
}

export const cartCount = (carts) => carts.reduce((sum, c) => sum + c.lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0), 0);

// The carts, kept up to date as they change here, in another tab or after coming back.
export function useShopCarts() {
  const [carts, setCarts] = useState(() => listShopCarts());
  useEffect(() => {
    const refresh = () => setCarts(listShopCarts());
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(CART_EVENT, refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', onVisible);
    refresh();
    return () => {
      window.removeEventListener(CART_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return carts;
}

export function useCartCount() {
  return cartCount(useShopCarts());
}
