// Explore listing → cart checks (node verification/listing.test.mjs), no browser and no network:
//  • the option rules (sizes, add-ons) shared by the shop page's item screen and Explore's
//    options sheet (src/lib/itemOptions.js), with the option shapes stored in the live database;
//  • the carts (src/lib/shopCart.js): Add to cart / Buy now from Explore write the very line the
//    shop page's own addToCart writes (read from src/pages/Storefront.jsx, not retyped here), so
//    both put the same thing in the shop's cart and checkout reads it the same way.
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
// Inside the app, so the bundle finds the app's own packages (React).
const cache = path.join(app, 'node_modules', '.cache');
await mkdir(cache, { recursive: true });
const out = path.join(cache, `sellio-listing-test-${process.pid}.mjs`);
await build({
  stdin: { resolveDir: app, loader: 'js', contents: "export * from '@/lib/itemOptions'; export * from '@/lib/shopCart';" },
  outfile: out, bundle: true, format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') },
  external: ['react'], logLevel: 'silent',
});

// A browser-ish window: localStorage (that can be made to fail) and events.
class MemoryStorage {
  constructor() { this.map = new Map(); this.fail = false; }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.fail) throw new Error('QuotaExceededError'); this.map.set(k, String(v)); }
  removeItem(k) { if (this.fail) throw new Error('SecurityError'); this.map.delete(k); }
  clear() { this.map.clear(); }
}
const win = new EventTarget();
win.localStorage = new MemoryStorage();
globalThis.window = win;
let events = 0;
win.addEventListener('sellio:carts', () => { events += 1; });

let m;
try { m = await import(out); } finally { await rm(out, { force: true }); }
let checks = 0;
const ok = (name) => { checks += 1; console.log('PASS ' + name); };

// The shop page's own addToCart, taken from its source.
const storefront = await readFile(path.join(app, 'src/pages/Storefront.jsx'), 'utf8');
const addStart = storefront.indexOf('const addToCart = (product, variant = null, notes = null) => {');
assert.ok(addStart > 0, 'Storefront.jsx still has addToCart');
const addBody = storefront.slice(addStart, storefront.indexOf('\n  };', addStart));
const keyExpr = addBody.match(/const key = (.*);\n/)[1];
const lineExpr = addBody.match(/return \[\.\.\.prev, (\{ key, product_id[^\n]*\})\];/)[1];
// eslint-disable-next-line no-new-func
const shopAdd = new Function('prev', 'product', 'variant', 'notes', `
  const key = ${keyExpr};
  const existing = prev.find(i => i.key === key);
  if (existing) return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
  return [...prev, ${lineExpr}];`);

// ── Options, as stored (Cafetelier's items) ──
const RICE_WINE = [
  { name: 'Extras', type: 'addon', options: [{ label: 'Extra egg', price_modifier: 1 }, { label: 'Extra noodle', price_modifier: 1 }, { label: 'Extra meat', price_modifier: 5 }] },
  { name: 'Size', type: 'other', options: [{ label: 'Small', price_modifier: 0 }, { label: 'Medium', price_modifier: 1 }, { label: 'Large', price_modifier: 2 }] },
];
const LEGACY = [{ size: 'SMALL', price: 4.5 }, { size: 'MEDIUM', price: 5.5 }, { size: 'LARGE', price: 6.5 }];
{
  assert.equal(m.normaliseVariants(RICE_WINE, 15), RICE_WINE, 'grouped options are used as stored');
  assert.deepEqual(m.normaliseVariants(LEGACY, 4.5), [{ name: 'Size', options: [
    { label: 'SMALL', price_modifier: 0 }, { label: 'MEDIUM', price_modifier: 1 }, { label: 'LARGE', price_modifier: 2 }] }]);
  assert.deepEqual(m.normaliseVariants([{ size: 'S', price: 3 }, { size: 'L', price: 4.25 }], 0), [{ name: 'Size', options: [
    { label: 'S', price_modifier: 0 }, { label: 'L', price_modifier: 1.25 }] }], 'no price: the cheapest is the base');
  // (As the shop page always read it: the first other key names the group.)
  assert.deepEqual(m.normaliseVariants([{ name: 'Extra cheese', price_modifier: 1 }], 5), [{ name: 'Name', options: [{ label: 'Extra cheese', price_modifier: 0 }] }]);
  assert.deepEqual(m.normaliseVariants([], 5), []);
  assert.deepEqual(m.normaliseVariants(null, 5), []);
}
ok('options are read as the shop page reads them (grouped, older flat lists, none)');

{
  const groups = m.normaliseVariants(RICE_WINE, 15);
  const [extras, size] = groups;
  let picks = {};
  picks = m.pickOption(picks, groups, 0, extras.options[2]); // Extra meat
  picks = m.pickOption(picks, groups, 0, extras.options[0]); // Extra egg
  picks = m.pickOption(picks, groups, 1, size.options[0]);   // Small
  picks = m.pickOption(picks, groups, 1, size.options[1]);   // Medium replaces Small
  assert.equal(m.isPicked(picks, groups, 1, size.options[0]), false);
  assert.equal(m.isPicked(picks, groups, 1, size.options[1]), true);
  assert.deepEqual(m.combineChoices(picks), { label: 'Extra meat, Extra egg, Medium', price_modifier: 7 }, 'group order; add-ons in the order picked');
  picks = m.pickOption(picks, groups, 0, extras.options[2]); // Extra meat off again
  assert.deepEqual(m.combineChoices(picks), { label: 'Extra egg, Medium', price_modifier: 2 });
  assert.equal(m.combineChoices({}), null);
  // Checkout reads the option back as its labels.
  assert.deepEqual(m.combineChoices(picks).label.split(', '), ['Extra egg', 'Medium']);
}
ok('picking: add-ons any number, a pick-one group one; the cart option is what checkout reads');

{
  const groups = m.normaliseVariants(RICE_WINE, 15);
  assert.deepEqual(m.missingChoices(groups, {}).map((g) => g.name), ['Size']);
  const onlyAddon = m.pickOption({}, groups, 0, groups[0].options[0]);
  assert.deepEqual(m.missingChoices(groups, onlyAddon).map((g) => g.name), ['Size'], 'add-ons alone are not enough');
  assert.deepEqual(m.missingChoices(groups, m.pickOption(onlyAddon, groups, 1, groups[1].options[2])), []);
  assert.equal(m.isRequiredChoice(m.normaliseVariants(LEGACY, 4.5)[0]), true, 'an older flat size list is pick-one, so required');
  assert.deepEqual(m.missingChoices([{ name: 'Size', options: [] }, { name: 'Add-ons', type: 'addon', options: [] }], {}), [], 'a group with nothing in it never blocks');
  assert.equal(m.isRequiredChoice(m.normaliseVariants([{ name: 'Extra cheese', price_modifier: 1 }], 5)[0]), false, 'an older flat list of extras stays optional');
  assert.equal(m.isRequiredChoice({ name: 'Size', options: [{ label: 'S' }] }), true, 'an older grouped size list without a type is still pick-one');
  assert.equal(m.isMultiChoice({ type: 'Addon' }), true, 'add-on groups in any letter case, as checkout reads them');
  assert.equal(m.chooseLabel({ name: 'Size' }), 'Choose a size');
  assert.equal(m.chooseLabel({ name: 'Ice level' }), 'Choose an ice level');
  assert.equal(m.chooseLabel({ name: '' }), 'Choose an option');
}
ok('a pick-one group must be answered before adding; the button says what to choose');

// ── Carts ──
const store = win.localStorage;
const product = { id: 'p-1', name: 'Chinese Rice Wine Chicken', price: 15, image_url: 'https://img.example/1.jpg' };
for (const [variant, notes] of [[null, null], [{ label: 'Extra egg, Medium', price_modifier: 2 }, null], [{ label: 'Large', price_modifier: 2 }, 'No onions'], [null, 'Less spicy']]) {
  store.clear();
  let reference = [];
  for (let i = 0; i < 3; i += 1) {
    reference = shopAdd(reference, product, variant, notes);
    assert.equal(m.addToShopCart('cafetelier', product, variant, notes, 1, { name: 'Cafetelier' }), true);
    assert.deepEqual(JSON.parse(store.getItem('sf_cart_cafetelier')), JSON.parse(JSON.stringify(reference)));
  }
}
ok("Add to cart writes the shop page's own line (key, price, option, note) and adds up the same way");

{
  store.clear();
  const pageLines = shopAdd(shopAdd([], { id: 'p-2', name: 'Latte', price: 4.65 }, { label: 'Small', price_modifier: 0 }, null), product, null, null);
  store.setItem('sf_cart_cafetelier', JSON.stringify(pageLines));
  m.addToShopCart('cafetelier', product, { label: 'Large', price_modifier: 2 }, null, 2);
  const lines = JSON.parse(store.getItem('sf_cart_cafetelier'));
  assert.deepEqual(lines.slice(0, 2), JSON.parse(JSON.stringify(pageLines)), "the shop page's lines are kept as they are");
  assert.deepEqual(lines[2], { key: 'p-1-Large', product_id: 'p-1', name: 'Chinese Rice Wine Chicken', price: 17, image_url: 'https://img.example/1.jpg', quantity: 2, variant: 'Large', notes: null });
  m.ensureInShopCart('cafetelier', product, null, null, 1);
  assert.equal(JSON.parse(store.getItem('sf_cart_cafetelier'))[1].quantity, 1, 'Buy now on an item already in the cart adds no second one');
  m.ensureInShopCart('cafetelier', product, null, null, 3);
  assert.equal(JSON.parse(store.getItem('sf_cart_cafetelier'))[1].quantity, 3);
  m.setShopCartQuantity('cafetelier', 'p-1-Large', 0);
  assert.equal(JSON.parse(store.getItem('sf_cart_cafetelier')).some((l) => l.key === 'p-1-Large'), false);
  m.addToShopCart('cafetelier', product, null, null, 500);
  assert.equal(JSON.parse(store.getItem('sf_cart_cafetelier'))[1].quantity, 99, 'at most 99 of a line');
  for (const l of JSON.parse(store.getItem('sf_cart_cafetelier'))) m.setShopCartQuantity('cafetelier', l.key, 0);
  assert.equal(store.getItem('sf_cart_cafetelier'), null, "an emptied shop's cart goes");
}
ok('Buy now, − / + / remove and the 99 cap; other lines untouched');

{
  store.clear();
  store.setItem('sf_cart_visited-shop', '[]');
  // A table's order, staff taking an order and the owner's preview keep carts of their own.
  for (const k of ['sf_table_cart_old-shop_t1', 'sf_staff_cart_old-shop', 'sf_preview_cart_old-shop']) store.setItem(k, JSON.stringify(shopAdd([], { id: 'x', name: 'X', price: 9 }, null, null)));
  store.setItem('sf_cart_broken', '{not json');
  store.setItem('sellio_device_id', 'dev_1');
  store.setItem('sf_cart_old-shop', JSON.stringify(shopAdd([], { id: 'a', name: 'A', price: 2 }, null, null)));
  m.addToShopCart('newer-shop', { id: 'b', name: 'B', price: 3 }, null, null, 2, { name: 'Newer', currency: 'MYR' });
  const carts = m.listShopCarts();
  assert.deepEqual(carts.map((c) => c.slug), ['newer-shop', 'old-shop']);
  assert.equal(carts[0].shop.currency, 'MYR');
  assert.equal(m.cartCount(carts), 3);
  const before = events;
  await new Promise((resolve) => setTimeout(resolve, 5)); // a moment later (a person's next tap)
  m.addToShopCart('old-shop', { id: 'c', name: 'C', price: 1 }, null, null, 1, { name: 'Old' });
  assert.ok(events > before, 'the cart icons hear about it');
  assert.deepEqual(m.listShopCarts().map((c) => c.slug), ['old-shop', 'newer-shop']);
  store.fail = true;
  assert.equal(m.addToShopCart('old-shop', product), false, 'a phone that cannot keep it is told so');
  store.fail = false;
}
ok('the Cart lists shops with something in their cart, newest first, and counts every item');

console.log(`${checks} listing and cart checks passed (no network, no real account).`);
