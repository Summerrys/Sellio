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

// Add to cart: one more of the line (or `quantity` more). False if this device can't
// keep it (storage blocked or full).
export function addToShopCart(slug, product, variant = null, notes = null, quantity = 1, shop = null) {
  if (!slug || !product?.id) return false;
  const qty = clampQuantity(quantity);
  const key = cartLineKey(product.id, variant, notes);
  const lines = readRaw(slug);
  const existing = lines.find(l => l?.key === key);
  const next = existing
    ? lines.map(l => (l?.key === key ? { ...l, quantity: Math.max(Number(l.quantity) || 0, Math.min(MAX_LINE_QUANTITY, (Number(l.quantity) || 0) + qty)) } : l))
    : [...lines, newLine(product, variant, notes, qty)];
  if (!write(slug, next)) return false;
  rememberShop(slug, shop);
  return true;
}

// Buy now: the line is in the cart with at least `quantity` (tapping Buy now on an item
// that is already in the cart doesn't add a second one).
export function ensureInShopCart(slug, product, variant = null, notes = null, quantity = 1, shop = null) {
  if (!slug || !product?.id) return false;
  const qty = clampQuantity(quantity);
  const key = cartLineKey(product.id, variant, notes);
  const lines = readRaw(slug);
  const existing = lines.find(l => l?.key === key);
  const next = existing
    ? lines.map(l => (l?.key === key ? { ...l, quantity: Math.max(Number(l.quantity) || 0, qty) } : l))
    : [...lines, newLine(product, variant, notes, qty)];
  if (!write(slug, next)) return false;
  rememberShop(slug, shop);
  return true;
}

// The Cart page's − / + / remove (0 removes the line).
export function setShopCartQuantity(slug, key, quantity) {
  const lines = readRaw(slug);
  const n = Math.floor(Number(quantity) || 0);
  const next = n > 0
    ? lines.map(l => (l?.key === key ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, n) } : l))
    : lines.filter(l => l?.key !== key);
  return write(slug, next);
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
