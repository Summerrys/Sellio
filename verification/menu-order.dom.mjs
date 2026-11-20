// Products keep the menu's own order (Alvin, 20 Nov 2026: a scanned menu came out as
// Beverages above the mains, and the drinks as Lemonade, Iced Tea, Coffee… instead of Soft
// Drinks, Iced Tea, Lemonade…: a scan saves its items in one go, so they had the same time and
// the lists fell back to their random ids).
//   1. supabase/migrations/20261120051939_products_sort_order.sql on a local Postgres (PGlite):
//      every product gets sort_order 0; the storefront (anon) may sort by it; the lists' order
//      (sort_order, newest first, id) gives a scanned menu in its own order, with an item
//      added on its own at the top of its section, as before.
//   2. src/lib/storefrontCatalog.js: the one order every list uses, and nextSortOrder.
//   3. The CSV import (ProductImportDialog): rows in the file's order (they came out in
//      reverse), new categories after the shop's own.
// The scan's own save is in scan-review.dom.mjs.
// Run from the app root: node verification/menu-order.dom.mjs /tmp/sellio-verification
// (after: npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0 @electric-sql/pglite@0.3.16)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const { JSDOM } = require('jsdom');
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const temporary = await mkdtemp(path.join(app, '.menu-order-verification-'));
// Gone however the run ends (a failed check stops it before the end).
process.on('exit', () => rmSync(temporary, { recursive: true, force: true }));

// ── 1. The database ────────────────────────────────────────────────────────────────────────
const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
// The parts of the live table that matter here (anon reads only the columns granted to it).
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create table public.products (
    id text primary key default gen_random_uuid()::text,
    tenant_id text not null,
    name text,
    category_id text,
    is_active boolean default true,
    created_date timestamptz default now()
  );
  grant select (id, tenant_id, name, category_id, is_active, created_date) on public.products to anon;
  grant select, insert, update, delete on public.products to authenticated;
`);
// An item added on its own before the migration, and a scan saved the old way: all at once
// (one time), with Cafelicious's ids (their first characters), in the menu's order.
await db.exec(`
  insert into products (id, tenant_id, name, category_id, created_date) values ('m-old', 'cafe', 'Kaya Toast', 'mains', now() - interval '1 day');
  insert into products (id, tenant_id, name, category_id) values ('3ed91410', 'cafe', 'Soft Drinks', 'drinks'), ('301e0f1b', 'cafe', 'Iced Tea', 'drinks'), ('1a9f9d3a', 'cafe', 'Lemonade', 'drinks');
`);
await db.exec(readFileSync(path.join(app, 'supabase/migrations/20261120051939_products_sort_order.sql'), 'utf8'));
const [column] = await rows(`select is_nullable, column_default, data_type from information_schema.columns where table_name = 'products' and column_name = 'sort_order'`);
assert.deepEqual(column, { is_nullable: 'NO', column_default: '0', data_type: 'integer' });
assert.deepEqual((await rows('select distinct sort_order from products')).map((r) => r.sort_order), [0], 'every product there already is 0: nothing moves');
// The lists' order, as PostgREST sends it, signed in or as the storefront (anon).
const ORDER = 'order by sort_order asc, created_date desc, id asc';
const listed = async (role, category) => {
  await db.exec(`set role ${role}`);
  try {
    return (await rows(`select name from products where tenant_id = 'cafe' and category_id = $1 ${ORDER}`, [category])).map((r) => r.name);
  } finally {
    await db.exec('reset role');
  }
};
assert.deepEqual(await listed('anon', 'drinks'), ['Lemonade', 'Iced Tea', 'Soft Drinks'], 'the old way: by id, as on the Products page on 20 Nov, not the menu');
// Without its grant, the storefront couldn't load at all.
await db.exec(`begin; revoke select (sort_order) on public.products from anon; set local role anon;`);
await assert.rejects(() => db.query(`select name from products where tenant_id = 'cafe' ${ORDER}`), /permission denied/);
await db.exec('rollback');
assert.deepEqual(await listed('anon', 'drinks'), ['Lemonade', 'Iced Tea', 'Soft Drinks'], 'with it, it loads');
passed('the migration: products.sort_order, whole numbers, 0 for every product there already is; the storefront may sort by it');

// A scan saved now: the same time for all, numbered in the menu's order (after the shop's
// highest, 0), ids in no particular order; then an item added on its own.
await db.exec(`
  insert into products (id, tenant_id, name, category_id, sort_order) values
    ('z-1', 'cafe', 'Grilled Chicken Caesar Salad', 'menu', 1), ('a-2', 'cafe', 'Classic Club Sandwich', 'menu', 2),
    ('q-3', 'cafe', 'Spinach and Feta Stuffed Chicken', 'menu', 3),
    ('m-4', 'cafe', 'Soft Drinks', 'bev', 4), ('b-5', 'cafe', 'Iced Tea', 'bev', 5),
    ('x-6', 'cafe', 'Freshly Squeezed Lemonade', 'bev', 6), ('c-7', 'cafe', 'Fruit Smoothies', 'bev', 7), ('n-8', 'cafe', 'Coffee', 'bev', 8);
`);
const menu = ['Grilled Chicken Caesar Salad', 'Classic Club Sandwich', 'Spinach and Feta Stuffed Chicken'];
const drinks = ['Soft Drinks', 'Iced Tea', 'Freshly Squeezed Lemonade', 'Fruit Smoothies', 'Coffee'];
for (const role of ['anon', 'authenticated']) {
  assert.deepEqual(await listed(role, 'menu'), menu, `${role}: the menu's order`);
  assert.deepEqual(await listed(role, 'bev'), drinks, `${role}: the drinks in the menu's order`);
}
await db.exec(`insert into products (id, tenant_id, name, category_id, created_date) values ('0-new', 'cafe', 'Teh Tarik', 'bev', now() + interval '1 minute')`);
assert.deepEqual(await listed('authenticated', 'bev'), ['Teh Tarik', ...drinks], 'an item added on its own: at the top of its section, as before');
passed('a scanned menu lists in its own order (as the storefront and signed in); an item added on its own stays at the top of its section');

// ── 2. The order every list uses ───────────────────────────────────────────────────────────
const catalogFile = path.join(temporary, 'catalog.mjs');
await build({ entryPoints: [path.join(app, 'src/lib/storefrontCatalog.js')], outfile: catalogFile, bundle: true, packages: 'external', format: 'esm', platform: 'node', logLevel: 'silent' });
const catalog = await import(pathToFileURL(catalogFile).href);
const recorder = (table, calls) => {
  const q = {
    select: (columns) => { calls.push([table, 'select', columns]); return q; },
    eq: (...a) => { calls.push([table, 'eq', ...a]); return q; },
    or: (...a) => { calls.push([table, 'or', ...a]); return q; },
    order: (column, options) => { calls.push([table, 'order', column, options?.ascending]); return q; },
    then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  return q;
};
const calls = [];
catalog.applyCanonicalProductOrder(recorder('products', calls));
assert.deepEqual(calls, [['products', 'order', 'sort_order', true], ['products', 'order', 'created_date', false], ['products', 'order', 'id', true]]);
calls.length = 0;
await catalog.fetchStorefrontCatalog({ from: (table) => recorder(table, calls) }, 'cafe');
assert.deepEqual(calls.filter((c) => c[0] === 'products' && c[1] === 'order').map((c) => [c[2], c[3]]), [['sort_order', true], ['created_date', false], ['id', true]],
  'the storefront, Design Store and Counter: the same order');
assert.ok(!calls.some((c) => c[0] === 'products' && c[1] === 'select' && /sort_order/.test(c[2])), 'the storefront\'s columns are as before');
assert.equal(catalog.nextSortOrder([]), 1);
assert.equal(catalog.nextSortOrder(null), 1);
assert.equal(catalog.nextSortOrder([{ sort_order: 7 }]), 8);
assert.equal(catalog.nextSortOrder([{ sort_order: null }, { sort_order: '3' }, {}, { sort_order: 2 }]), 4);
passed('one order for Products, the Counter, Design Store and the storefront: the menu\'s, then newest first, then id; the next number');

// ── 3. The CSV import ──────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'DocumentFragment', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'getComputedStyle', 'navigator', 'FileReader']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const act = React.act;
globalThis.__h = React.createElement;
const stubs = {
  client: 'export const getSupabase = async () => globalThis.__client;',
  sonner: 'const push = (kind) => (...a) => globalThis.__toasts.push([kind, ...a]); export const toast = Object.assign(push("plain"), { success: push("success"), error: push("error"), message: push("message") });',
  dialog: [
    'const h = (...a) => globalThis.__h(...a);',
    'export const Dialog = ({ open, children }) => (open ? children : null);',
    'export const DialogContent = ({ children }) => h("div", { role: "dialog" }, children);',
    'export const DialogHeader = ({ children }) => children;',
    'export const DialogTitle = ({ children }) => h("h2", null, children);',
  ].join('\n'),
  progress: 'export const Progress = () => null;',
  alert: 'export const Alert = ({ children }) => globalThis.__h("div", null, children); export const AlertDescription = ({ children }) => children;',
};
const importFile = path.join(temporary, 'import.mjs');
await build({
  entryPoints: [path.join(app, 'src/components/products/ProductImportDialog.jsx')], outfile: importFile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(app, 'src') }, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'stub' }));
    route(/supabaseClient$/, 'client');
    route(/^sonner$/, 'sonner');
    route(/components\/ui\/dialog$/, 'dialog');
    route(/components\/ui\/progress$/, 'progress');
    route(/components\/ui\/alert$/, 'alert');
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
  } }],
});
const { default: ProductImportDialog } = await import(pathToFileURL(importFile).href);

const writes = [];
const reads = [];
let lastItem;
globalThis.__toasts = [];
globalThis.__client = {
  from: (table) => ({
    insert: (row) => {
      writes.push({ table, row });
      if (table === 'categories') return { select: () => ({ single: async () => ({ data: { id: 'cat-' + row.name }, error: null }) }) };
      if (table === 'products') return { select: () => ({ single: async () => ({ data: { id: 'p-' + writes.length, stock_quantity: row.stock_quantity, low_stock_threshold: row.low_stock_threshold }, error: null }) }) };
      return Promise.resolve({ error: null });
    },
    select: (columns) => {
      const query = { table, columns, eq: [], order: [], limit: null };
      reads.push(query);
      const chain = {
        eq: (column, value) => { query.eq.push([column, value]); return chain; },
        order: (column, options) => { query.order.push([column, options?.ascending]); return chain; },
        limit: async (n) => { query.limit = n; return lastItem; },
      };
      return chain;
    },
  }),
};
const next = () => new Promise((resolve) => setTimeout(resolve, 5));
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => next()); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const CSV = [
  'Name,Category,Price',
  'Soft Drinks,Beverages,2.99',
  'Iced Tea,Beverages,2.99',
  'Kopi,drinks,1.80',
  'Grilled Chicken Caesar Salad,Mains,12.99',
  ',Mains,1',
  'Bottled Water,Beverages,1.99',
].join('\n');
async function importCsv() {
  writes.length = 0; reads.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient();
  await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(ProductImportDialog, { open: true, onOpenChange() {}, tenantId: 'shop-1', categories: [{ id: 'cat-drinks', name: 'Drinks', sort_order: 2 }, { id: 'cat-x', name: 'X', sort_order: null }] }))));
  const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new dom.window.File([CSV], 'menu.csv', { type: 'text/csv' })] });
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await settle();
  const go = [...container.querySelectorAll('button')].find((b) => /^Import 5 Products$/.test(text(b)));
  assert.ok(go, 'the preview offers to import the 5 good rows');
  await act(async () => { go.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await settle(20);
  assert.match(text(container), /Import Complete!/);
  await act(async () => root.unmount());
  container.remove();
}
try {
  lastItem = { data: [{ sort_order: 10 }], error: null };
  await importCsv();
  assert.deepEqual(reads, [{ table: 'products', columns: 'sort_order', eq: [['tenant_id', 'shop-1']], order: [['sort_order', false]], limit: 1 }], 'the shop\'s highest item number');
  assert.deepEqual(writes.filter((w) => w.table === 'categories').map((w) => [w.row.name, w.row.sort_order]), [['Beverages', 3], ['Mains', 4]],
    'new categories after the shop\'s own (highest 2), in the file\'s order');
  assert.deepEqual(writes.filter((w) => w.table === 'products').map((w) => [w.row.name, w.row.category_id, w.row.sort_order]), [
    ['Soft Drinks', 'cat-Beverages', 11], ['Iced Tea', 'cat-Beverages', 12], ['Kopi', 'cat-drinks', 13],
    ['Grilled Chicken Caesar Salad', 'cat-Mains', 14], ['Bottled Water', 'cat-Beverages', 15],
  ], 'rows numbered in the file\'s order after the shop\'s highest (10); the row without a name is left out');
  // The highest number can't be read: the import still runs, from 1.
  lastItem = { data: null, error: { message: 'Network request failed' } };
  const warned = [];
  const warn = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try { await importCsv(); } finally { console.warn = warn; }
  assert.deepEqual(writes.filter((w) => w.table === 'products').map((w) => w.row.sort_order), [1, 2, 3, 4, 5]);
  assert.ok(warned.some((w) => /could not read the last item/.test(w)), 'and says why in the log');
  passed('the CSV import: rows in the file\'s order (numbered after the shop\'s highest), new categories after the shop\'s own');
} finally {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
  await db.close();
}
console.log(`\n${passes} menu order checks passed`);
