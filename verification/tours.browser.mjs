// The walk-through tours (Dashboard, Products, Orders, Settings) in the whole app, in real Chrome:
// src/main.jsx with its router, Layout, pages and tours, signed in as the shop's owner, with a
// stand-in Supabase in the page (window.__client) answering from window.__db. Every step of each
// tour, on a phone, a small phone and a computer, for a café and for a home seller, a new shop
// (nothing yet: the tours point at sample cards) and one with orders:
//   - the step count runs 1, 2, 3 … of N, N being the steps shown (none for things the shop
//     hasn't got, like Kitchen Display or staff logins);
//   - the spotlight is on the step's target, and the target is whole on the screen: below the
//     header and above the tab bar, scrolled there if it wasn't (Back as well as Next);
//   - a step on a fixed bar (the Counter button, the tab bar, the sidebar) doesn't move the page;
//   - the tooltip is on the screen and off the target;
//   - finishing a stage saves its progress once.
// Run after `npm run build` (the app's page and styles):
//   node verification/tours.browser.mjs /tmp/sellio-verification [picture folder]
// (/tmp/sellio-verification has playwright-core; Chrome at CHROME_PATH or /usr/bin/google-chrome.)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const shots = process.argv[3] || null;
if (shots) await mkdir(shots, { recursive: true });

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

// The app, with every import of the Supabase client (however it's written) answered by the page.
const plugin = { name: 'stand-ins', setup(b) {
  b.onResolve({ filter: /(^|\/)supabaseClient(\.js)?$/ }, () => ({ path: 'client', namespace: 'stub' }));
  b.onResolve({ filter: /^firebase\/messaging$/ }, (args) => (/@capacitor-firebase[\\/]messaging/.test(args.importer)
    ? { path: path.join(app, 'src/lib/firebaseMessagingWebStub.js') } : null));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ loader: 'js', resolveDir: app, contents: `
    export const SUPABASE_URL = 'https://stand-in.supabase.invalid';
    export async function getSupabase() { return window.__client; }
    export const supabase = new Proxy({}, { get(_, prop) { return (...args) => Promise.resolve(window.__client[prop](...args)); } });` }));
} };
const result = await build({
  entryPoints: [path.join(app, 'src/main.jsx')], write: false, bundle: true, format: 'esm', jsx: 'automatic', minify: false,
  splitting: false, alias: { '@': path.join(app, 'src') }, nodePaths: [path.join(app, 'node_modules')],
  loader: { '.js': 'jsx', '.css': 'empty' }, plugins: [plugin], logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{"PROD":true,"DEV":false,"MODE":"production"}' },
});
const js = result.outputFiles[0].text;
const page = await readFile(path.join(app, 'dist/app.html'), 'utf8');
const html = page.replace(/<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/, '<script type="module" src="/harness.js"></script>');
assert.notEqual(html, page, 'dist/app.html loads the app from /assets (run npm run build first)');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

// The stand-in Supabase: a query builder that filters window.__db.tables by eq/in/neq/is and applies
// updates and inserts to them (noted in window.__writes); rpc answers from window.__db.rpc.
const CLIENT = `
(() => {
  const db = window.__db;
  window.__writes = [];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const has = (r, c) => Object.prototype.hasOwnProperty.call(r, c);
  function query(table) {
    const filters = [];
    let op = 'select'; let payload = null; let head = false; let one = null; let lim = null;
    const matches = (r) => filters.every((f) => f(r));
    const run = () => {
      const all = db.tables[table] || (db.tables[table] = []);
      if (op === 'update') {
        all.filter(matches).forEach((r) => Object.assign(r, clone(payload)));
        window.__writes.push({ table, op, payload: clone(payload) });
        return { data: clone(all.filter(matches)), error: null };
      }
      if (op === 'insert' || op === 'upsert') {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: 'new-' + Math.random().toString(36).slice(2), ...clone(r) }));
        all.push(...rows);
        window.__writes.push({ table, op, payload: clone(payload) });
        return { data: rows, error: null };
      }
      if (op === 'delete') { window.__writes.push({ table, op }); return { data: null, error: null }; }
      let rows = all.filter(matches);
      if (lim != null) rows = rows.slice(0, lim);
      return { data: head ? null : clone(rows), error: null, count: rows.length };
    };
    const q = {
      select(cols, opts) { if (opts && opts.head) head = true; return q; },
      eq(c, v) { filters.push((r) => !has(r, c) || r[c] === v || String(r[c]) === String(v)); return q; },
      neq(c, v) { filters.push((r) => !has(r, c) || r[c] !== v); return q; },
      in(c, vs) { filters.push((r) => !has(r, c) || (vs || []).includes(r[c])); return q; },
      is(c, v) { filters.push((r) => !has(r, c) || r[c] === v || (v === null && r[c] == null)); return q; },
      limit(n) { lim = n; return q; },
      single() { one = 'single'; return q; },
      maybeSingle() { one = 'maybe'; return q; },
      insert(p) { op = 'insert'; payload = p; return q; },
      upsert(p) { op = 'upsert'; payload = p; return q; },
      update(p) { op = 'update'; payload = p; return q; },
      delete() { op = 'delete'; return q; },
      then(yes, no) {
        const out = run();
        if (one) { const row = Array.isArray(out.data) ? out.data[0] || null : out.data; out.data = row; if (!row && one === 'single') out.error = { code: 'PGRST116', message: 'no rows' }; }
        return Promise.resolve(out).then(yes, no);
      },
    };
    for (const name of ['order', 'range', 'gte', 'gt', 'lte', 'lt', 'like', 'ilike', 'or', 'not', 'contains', 'containedBy', 'overlaps', 'match', 'filter', 'textSearch', 'returns', 'abortSignal', 'throwOnError', 'csv'])
      q[name] = () => q;
    return q;
  }
  const channel = () => { const ch = { on: () => ch, subscribe: (cb) => { try { cb && cb('SUBSCRIBED'); } catch {} return ch; }, unsubscribe: async () => 'ok', send: async () => 'ok', track: async () => 'ok', untrack: async () => 'ok', presenceState: () => ({}) }; return ch; };
  const blank = 'https://sellio.test/blank.png';
  window.__client = {
    auth: {
      getSession: async () => ({ data: { session: db.session }, error: null }),
      getUser: async () => ({ data: { user: db.session.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      refreshSession: async () => ({ data: { session: db.session }, error: null }),
      updateUser: async () => ({ data: { user: db.session.user }, error: null }),
    },
    from: query,
    rpc: async (name) => ({ data: db.rpc[name] === undefined ? null : clone(db.rpc[name]), error: null }),
    channel, removeChannel: async () => 'ok', removeAllChannels: async () => [], getChannels: () => [],
    realtime: { setAuth() {} },
    storage: { from: () => ({
      upload: async (p) => ({ data: { path: p }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: blank } }),
      createSignedUrl: async () => ({ data: { signedUrl: blank }, error: null }),
      createSignedUrls: async (ps) => ({ data: ps.map((p) => ({ path: p, signedUrl: blank })), error: null }),
      remove: async () => ({ data: [], error: null }), list: async () => ({ data: [], error: null }),
    }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
  try { sessionStorage.setItem('sellio_install_prompt_login_shown', '1'); } catch {}
})();
`;

// The owner and the shop: 'cafe' (a business on Growth, every feature) or 'home' (a free home
// seller). tour: the stages done already. full: products and orders (else a new, empty shop).
function makeDb(kind, tour, full) {
  const now = Date.now();
  const iso = (ms) => new Date(now + ms).toISOString();
  const email = 'ann@example.com';
  const cafe = kind === 'cafe';
  const on = { can_use_pos: true, can_use_inventory: true, can_use_table_ordering: true, can_use_kitchen_display: true, can_manage_staff: true, can_use_ai_assistant: true, can_customize_storefront: true, can_print: true };
  const items = cafe
    ? [['Kopi O', 1.8, 'Drinks'], ['Teh Tarik', 2.2, 'Drinks'], ['Kaya Toast Set', 5.5, 'Breakfast'], ['Mee Siam', 6.5, 'Mains'], ['Nasi Lemak', 7.5, 'Mains'], ['Chicken Rice', 6.8, 'Mains']]
    : [['Pineapple tarts (box of 20)', 18, null], ['Kaya jar', 6, null], ['Pandan chiffon cake', 22, null], ['Kueh lapis', 15, null]];
  return {
    session: { access_token: 'stand-in', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, refresh_token: 'stand-in', user: { id: 'auth-1', email, aud: 'authenticated', role: 'authenticated' } },
    cookie: { id: 'user-1', email, full_name: 'Ann Tan', role: 'user', onboarding_completed: true, tenant_id: 'shop-1', phone: '+6591234567' },
    tables: {
      app_users: [{ id: 'user-1', email, full_name: 'Ann Tan', role: 'user', onboarding_completed: true, tenant_id: 'shop-1', phone: '+6591234567', has_seen_tour: false, tour_progress: tour, order_alerts: true, is_active: true }],
      tenant_users: [{ id: 'tu-1', tenant_id: 'shop-1', user_email: email, user_name: 'Ann Tan', role_id: 'role-owner', status: 'active', is_owner: true }],
      tenants: [{ id: 'shop-1', name: cafe ? 'Kopi Corner' : 'Ann Bakes', slug: cafe ? 'kopi-corner' : 'ann-bakes', industry: cafe ? 'cafe' : 'retail', seller_type: cafe ? 'merchant' : 'individual', status: 'active', is_public: true, owner_email: email, country: 'SG', settings: { currency: 'SGD' }, logo_url: null, has_used_trial: true, onboarding_completed: true, created_date: iso(-86400000) }],
      roles: [{ id: 'role-owner', tenant_id: 'shop-1', name: 'Owner', permissions: ['*'] }],
      subscriptions: cafe ? [{ id: 'sub-1', tenant_id: 'shop-1', status: 'active', tier: 'growth', current_period_end: iso(20 * 86400000), created_date: iso(-86400000) }] : [],
      products: full ? items.map(([name, price, category], i) => ({ id: 'p' + i, tenant_id: 'shop-1', name, price, category, is_active: true, is_available: true, sort_order: i, track_inventory: false, image_url: null, created_date: iso(-i * 60000) })) : [],
      categories: cafe ? ['Drinks', 'Breakfast', 'Mains'].map((name, i) => ({ id: 'c' + i, tenant_id: 'shop-1', name, sort_order: i })) : [],
      orders: full ? [
        { id: 'o3', tenant_id: 'shop-1', order_number: 'ORD-000003', status: 'pending', type: 'takeaway', customer_name: 'Eve Lim', total_amount: 8, payment_status: 'unpaid', items: [{ name: 'Kopi O', quantity: 2, price: 1.8 }, { name: 'Kaya Toast Set', quantity: 1, price: 5.5 }], created_date: iso(-5 * 60000) },
        { id: 'o2', tenant_id: 'shop-1', order_number: 'ORD-000002', status: 'preparing', type: 'dine_in', table_name: 'T4', total_amount: 14.3, payment_status: 'unpaid', items: [{ name: 'Nasi Lemak', quantity: 1, price: 7.5 }, { name: 'Chicken Rice', quantity: 1, price: 6.8 }], created_date: iso(-18 * 60000) },
        { id: 'o1', tenant_id: 'shop-1', order_number: 'ORD-000001', status: 'ready', type: 'takeaway', customer_name: 'Raj', total_amount: 6.5, payment_status: 'paid', payment_method: 'cash', items: [{ name: 'Mee Siam', quantity: 1, price: 6.5 }], created_date: iso(-40 * 60000) },
      ] : [],
    },
    rpc: {
      get_tenant_entitlements: { plan: cafe ? 'growth' : 'personal', entitlements: cafe ? on : Object.fromEntries(Object.keys(on).map((k) => [k, false])) },
      shop_handovers: [], shop_packing_photos: [],
    },
  };
}

// Each stage's steps: the data-tour each one points at ('-' for a step in the middle of the screen).
const CAFE_PHONE = {
  dashboard: ['-', 'avatar-menu-btn', 'ai-assistant-btn', 'design-store-btn', 'dashboard-stats', 'counter-shortcut', 'quick-access', 'bottom-nav', '-'],
  products: ['products-header', 'add-product-btn', 'scan-menu-btn', 'product-card', 'product-card', '-', '-'],
  orders: ['order-status-cards', 'order-tabs', 'kitchen-display-btn', 'sound-alerts-toggle', 'order-status-btn', 'order-card', '-', '-'],
  settings: ['settings-business-tab', 'settings-payment-tab', 'settings-theme-tab', 'settings-users-tab', '-'],
};
const CAFE_COMPUTER = {
  ...CAFE_PHONE,
  dashboard: ['-', 'desktop-nav', 'ai-assistant-btn', 'design-store-btn', 'dashboard-stats', 'take-orders-btn', 'quick-access', 'desktop-nav', '-'],
};
const HOME = {
  dashboard: ['-', 'avatar-menu-btn', 'dashboard-stats', 'quick-access', 'bottom-nav', '-'],
  products: ['products-header', 'add-product-btn', 'product-card', 'product-card', '-'],
  orders: ['order-status-cards', 'order-tabs', 'sound-alerts-toggle', 'order-status-btn', 'order-card', '-'],
  settings: ['settings-business-tab', 'settings-payment-tab', 'settings-theme-tab', '-'],
};
const STAGES = ['dashboard', 'products', 'orders', 'settings'];
const URLS = {
  cafe: { dashboard: '/Dashboard', products: '/Products', orders: '/Orders', settings: '/TenantSettings' },
  home: { dashboard: '/Dashboard', products: '/explore/listings', orders: '/Orders', settings: '/TenantSettings' },
};
const PHONE = { width: 390, height: 844, mobile: true };
const SMALL = { width: 360, height: 640, mobile: true };
const COMPUTER = { width: 1280, height: 800, mobile: false };
const RUNS = [
  // A new café: the sample product and order cards sit low on the page; Back from the sample card
  // goes up to Scan, which is then under the header unless the page scrolls back.
  { name: 'café, new, phone', kind: 'cafe', full: false, screen: PHONE, steps: CAFE_PHONE, stages: STAGES, back: { stage: 'products', at: 4 } },
  // After the Counter step (on the tab bar) the shortcuts are still where they were.
  { name: 'café with orders, phone', kind: 'cafe', full: true, screen: PHONE, steps: CAFE_PHONE, stages: ['dashboard', 'orders'] },
  { name: 'café with orders, small phone', kind: 'cafe', full: true, screen: SMALL, steps: CAFE_PHONE, stages: ['dashboard', 'orders'] },
  // The sidebar is the screen's height: its steps' tooltips go beside it, not over it.
  { name: 'café with orders, computer', kind: 'cafe', full: true, screen: COMPUTER, steps: CAFE_COMPUTER, stages: ['dashboard', 'products'] },
  // No Kitchen Display, no staff logins: those steps aren't there, and aren't counted.
  { name: 'home seller, phone', kind: 'home', full: true, screen: PHONE, steps: HOME, stages: STAGES },
  // A new home seller's listings (under Explore's own header): the sample card scrolls the page a
  // little; Back to Add goes up to it under that header.
  { name: 'home seller, new, phone', kind: 'home', full: false, screen: PHONE, steps: HOME, stages: ['products'], back: { stage: 'products', at: 3 } },
];

// Where things are on the screen at a step: its target (as Joyride finds it), the spotlight, the
// tooltip, and the bars that stay put at the top and the bottom (whatever is fixed or sticky
// under the screen's top and bottom edges, found here without the app's own markers).
const MEASURE = (name) => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const shown = (el) => { const b = el && el.getBoundingClientRect(); return !!b && b.width > 0 && b.height > 0 && getComputedStyle(el).opacity !== '0'; };
  const bars = (y) => {
    const found = new Set();
    for (const x of [innerWidth * 0.5, innerWidth * 0.8]) {
      for (const el of document.elementsFromPoint(x, y)) {
        if (el.closest('[id^="react-joyride"], .react-joyride__overlay, .react-joyride__spotlight, .__floater, [data-sonner-toaster]')) continue;
        for (let node = el; node && node !== document.body; node = node.parentElement) {
          const position = getComputedStyle(node).position;
          const b = node.getBoundingClientRect();
          if ((position === 'fixed' || position === 'sticky') && b.height < innerHeight / 2) found.add(b);
        }
      }
    }
    return [...found];
  };
  const top = Math.max(0, ...bars(2).filter((b) => b.top <= 1).map((b) => b.bottom));
  const bottom = Math.min(innerHeight, ...bars(innerHeight - 2).filter((b) => b.bottom >= innerHeight - 1).map((b) => b.top));
  const target = name === '-' ? null : document.querySelector(`[data-tour="${name}"]`);
  let fixed = false;
  for (let node = target; node && node !== document.body; node = node.parentElement) if (getComputedStyle(node).position === 'fixed') fixed = true;
  const spot = document.querySelector('.react-joyride__spotlight');
  return {
    vw: innerWidth, vh: innerHeight, scrollY, top, bottom, fixed,
    target: r(target), spot: shown(spot) ? r(spot) : null,
    tip: r(document.querySelector('.react-joyride__tooltip')),
  };
};
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));

async function stepShown(page, label, where, timeout) {
  // The step's button names it ("Next (Step 3 of 7)", or Done on the last); then nothing moves.
  const button = page.locator('.react-joyride__tooltip button[data-action="primary"]');
  try {
    await page.waitForFunction((text) => document.querySelector('.react-joyride__tooltip button[data-action="primary"]')?.textContent === text, label, { timeout });
  } catch {
    assert.equal(await button.textContent({ timeout: 1000 }).catch(() => '(no step showing)'), label, `${where}: the step's button`);
  }
  let last = '';
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(120);
    const now = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return ''; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round).join(','); };
      return [Math.round(scrollY), r('.react-joyride__tooltip'), r('.react-joyride__spotlight')].join('|');
    });
    if (now === last) break;
    last = now;
  }
  return button;
}

function check(where, name, m, previousScroll) {
  assert.ok(m.tip, `${where}: a tooltip`);
  assert.ok(m.tip.x >= 0 && m.tip.r <= m.vw + 0.5 && m.tip.y >= 0 && m.tip.b <= m.vh + 0.5, `${where}: the tooltip on the screen ${JSON.stringify(m.tip)}`);
  if (name === '-') { assert.equal(m.spot, null, `${where}: no spotlight on a step in the middle`); return; }
  const t = m.target;
  assert.ok(t && t.w > 0, `${where}: [data-tour="${name}"] on the page`);
  assert.ok(m.spot, `${where}: a spotlight`);
  for (const [k, pad] of [['x', -10], ['y', -10], ['r', 10], ['b', 10]]) {
    assert.ok(Math.abs(m.spot[k] - (t[k] + pad)) <= 2, `${where}: the spotlight on ${name} (${k}: spotlight ${m.spot[k].toFixed(1)}, target ${t[k].toFixed(1)})`);
  }
  if (m.fixed) {
    assert.ok(t.y >= -0.5 && t.b <= m.vh + 0.5, `${where}: ${name} on the screen`);
    assert.equal(Math.round(m.scrollY), Math.round(previousScroll), `${where}: ${name} is on a fixed bar: the page doesn't move`);
  } else {
    assert.ok(t.y >= m.top - 0.5 && t.b <= m.bottom + 0.5, `${where}: ${name} ${Math.round(t.y)}–${Math.round(t.b)} whole between the header (${Math.round(m.top)}) and the tab bar (${Math.round(m.bottom)})`);
    // The spotlight reaches 10px past its target: brought into view, the target leaves it room
    // (a few pixels may go under the header at the very top of a page, which can't scroll up).
    assert.ok(m.spot.y >= m.top - 4 && m.spot.b <= m.bottom + 4, `${where}: the spotlight ${Math.round(m.spot.y)}–${Math.round(m.spot.b)} clear of the header (${Math.round(m.top)}) and the tab bar (${Math.round(m.bottom)})`);
  }
  assert.ok(overlap(m.tip, t) <= 0.02 * t.w * t.h, `${where}: the tooltip off ${name} (${Math.round(100 * overlap(m.tip, t) / (t.w * t.h))}% covered)`);
}

const browser = await chromium.launch({ executablePath: existsSync(executablePath) ? executablePath : undefined, headless: true });
try {
  for (const run of RUNS) {
    for (const stage of run.stages) {
      const done = Object.fromEntries(STAGES.slice(0, STAGES.indexOf(stage)).map((s) => [s, true]));
      const db = makeDb(run.kind, done, run.full);
      const context = await browser.newContext({
        viewport: { width: run.screen.width, height: run.screen.height }, deviceScaleFactor: 2, isMobile: run.screen.mobile, hasTouch: run.screen.mobile,
        locale: 'en-SG', timezoneId: 'Asia/Singapore', serviceWorkers: 'block',
      });
      await context.addCookies([{ name: 'app_session', value: encodeURIComponent(JSON.stringify(db.cookie)), domain: 'sellio.test', path: '/' }]);
      await context.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        if (u.hostname !== 'sellio.test') return route.abort();
        if (u.pathname === '/harness.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: js });
        const file = path.join(app, 'dist', decodeURIComponent(u.pathname));
        if (path.extname(u.pathname) && existsSync(file)) return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: await readFile(file) });
        return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      });
      await context.addInitScript(`window.__db = ${JSON.stringify(db)};\n${CLIENT}`);
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      await tab.goto('https://sellio.test' + URLS[run.kind][stage]);
      const steps = run.steps[stage];
      let previousScroll = 0;
      let first = true;
      const look = async (n, label) => {
        // The first step waits for the app to load (slower on a busy machine).
        const button = await stepShown(tab, label, `${run.name}, ${stage} step ${n}`, first ? 30000 : 10000);
        first = false;
        const m = await tab.evaluate(MEASURE, steps[n - 1]);
        check(`${run.name}, ${stage} step ${n}`, steps[n - 1], m, previousScroll);
        previousScroll = m.scrollY;
        if (shots) await tab.screenshot({ path: path.join(shots, `${run.name.replace(/[^a-z]+/gi, '-')}-${stage}-${n}.png`) });
        return button;
      };
      for (let n = 1; n <= steps.length; n += 1) {
        const label = n < steps.length ? `Next (Step ${n} of ${steps.length})` : 'Done';
        const button = await look(n, label);
        if (run.back && run.back.stage === stage && run.back.at === n) {
          await tab.locator('.react-joyride__tooltip button[data-action="back"]').click();
          await look(n - 1, `Next (Step ${n - 1} of ${steps.length})`);
          await tab.locator('.react-joyride__tooltip button[data-action="primary"]').click();
          await look(n, label);
        }
        await button.click();
      }
      await tab.locator('.react-joyride__tooltip').waitFor({ state: 'detached', timeout: 5000 });
      await tab.waitForTimeout(500);
      const saved = await tab.evaluate(() => window.__writes.filter((w) => w.table === 'app_users' && w.payload && w.payload.tour_progress).map((w) => w.payload));
      const progress = { ...done, [stage]: true };
      assert.deepEqual(saved, [{ tour_progress: progress, ...(stage === 'settings' ? { has_seen_tour: true } : {}) }], `${run.name}, ${stage}: saved once`);
      assert.deepEqual(errors, [], `${run.name}, ${stage}: no errors on the page`);
      await context.close();
      passed(`${run.name}: ${stage} (${steps.length} steps${run.back?.stage === stage ? ', and Back' : ''})`);
    }
  }
  console.log(`tours (browser): ${passes} passed`);
} finally {
  await browser.close();
}
