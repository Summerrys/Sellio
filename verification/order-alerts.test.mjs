// Order alert sounds (src/lib/useOrderAlerts.js): the setting, the tones and the reminders,
// with a stand-in for the tones, the database and the clock. No phone, no speaker.
// Run: node verification/order-alerts.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'localStorage', 'navigator']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── The clock: reminders and the website's keep-alive run on setInterval ─────────────────
let now = Date.parse('2026-11-04T12:00:00Z');
const realNow = Date.now;
Date.now = () => now;
const timers = new Map();
let nextTimer = 1;
globalThis.setInterval = (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms, due: now + ms }); return id; };
globalThis.clearInterval = (id) => { timers.delete(id); };
async function advance(ms) {
  const end = now + ms;
  for (;;) {
    const due = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
    if (!due) break;
    const [, t] = due;
    now = t.due;
    t.due += t.ms;
    await act(async () => { t.fn(); await flush(); });
  }
  now = end;
}

// ── The tones: what was played, muted or not, and what was stopped ───────────────────────
const plays = [];
const pauses = [];
const elements = [];
class FakeAudio {
  constructor(src) {
    this.src = src;
    this.kind = src.includes('Urgent') ? 'urgent' : 'new';
    this.muted = false;
    this.currentTime = 0;
    this.onended = null;
    this.preload = '';
    elements.push(this);
  }
  play() { plays.push({ kind: this.kind, muted: this.muted, at: now }); return Promise.resolve(); }
  pause() { pauses.push({ kind: this.kind, at: now }); }
  end() { if (this.onended) this.onended(); }
}
globalThis.Audio = FakeAudio;
const el = (kind) => elements.find((e) => e.kind === kind);
const audible = (kind) => plays.filter((p) => !p.muted && (!kind || p.kind === kind));
const reset = () => { plays.length = 0; pauses.length = 0; };

// ── The database: app_users.order_alerts for the signed-in person ─────────────────────────
const db = { order_alerts: false };
const updates = [];
globalThis.__client = {
  from: (table) => {
    assert.equal(table, 'app_users');
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { order_alerts: db.order_alerts }, error: null }) }) }),
      update: (values) => ({ eq: async (column, id) => { updates.push({ values, column, id }); Object.assign(db, values); return { error: null }; } }),
    };
  },
};

const React = await import('react');
const act = React.act || (await import('react-dom/test-utils')).act;
const { createRoot } = await import('react-dom/client');
const flush = () => new Promise((resolve) => setImmediate(resolve));

const tmp = await mkdtemp(path.join(app, '.order-alerts-verification-'));
const mocks = { name: 'order-alert-fixtures', setup(b) {
  b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const getSupabase = async () => globalThis.__client;', loader: 'js' }));
} };
const outfile = path.join(tmp, 'useOrderAlerts.mjs');
await build({ entryPoints: [path.join(app, 'src/lib/useOrderAlerts.js')], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') }, plugins: [mocks], logLevel: 'silent' });
const { useOrderAlerts, ORDER_ALERTS_EVENT } = await import(pathToFileURL(outfile).href);

let alerts;
function Page(props) { alerts = useOrderAlerts(props); return null; }
let root;
let props;
async function open(next) {
  props = { tenantId: 'shop-1', userId: 'user-1', orders: [], ...next };
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(React.createElement(Page, props)); await flush(); await flush(); });
}
async function update(next) {
  props = { ...props, ...next };
  await act(async () => { root.render(React.createElement(Page, props)); await flush(); });
}
async function leave() { await act(async () => { root.unmount(); await flush(); }); }
const run = async (fn) => act(async () => { fn(); await flush(); });
const order = (id, status, extra = {}) => ({ id, status, order_number: id, ...extra });
const inApp = (on) => {
  if (on) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  else delete window.Capacitor;
};

let passed = 0;
const check = async (name, fn) => { reset(); await fn(); passed += 1; console.log(`PASS ${name}`); };

try {
  inApp(true);

  await check('Off in the account setting stays off, even if this phone last had it on (the iPhone ringing while off)', async () => {
    localStorage.setItem('sellio_sound_alerts_shop-1', 'true');
    db.order_alerts = false;
    await open();
    assert.equal(alerts.on, false);
    assert.equal(localStorage.getItem('sellio_sound_alerts_shop-1'), 'false');
    await run(() => { alerts.seen(order('o1', 'pending')); alerts.ring(order('o1', 'pending')); });
    await advance(5 * 60_000);
    assert.equal(plays.length, 0, 'nothing rings');
  });

  await check('Turning on rings the test tone once in the app, and nothing silences it; the setting is saved', async () => {
    await run(() => alerts.setOn(true));
    assert.equal(alerts.on, true);
    assert.deepEqual(plays.map((p) => [p.kind, p.muted]), [['new', false]]);
    window.dispatchEvent(new dom.window.Event('pointerdown'));
    window.dispatchEvent(new dom.window.Event('touchstart'));
    await advance(60_000);
    assert.equal(pauses.length, 0, 'no tap or timer stops the test tone');
    assert.equal(plays.length, 1, 'no silent warm-up plays in the app');
    assert.deepEqual(updates.at(-1), { values: { order_alerts: true }, column: 'id', id: 'user-1' });
    assert.equal(localStorage.getItem('sellio_sound_alerts_shop-1'), 'true');
  });

  await check('A new order rings once, then the urgent tone twice every 30 seconds', async () => {
    await run(() => alerts.setEvery(30));
    await run(() => { alerts.seen(order('o2', 'pending')); alerts.ring(order('o2', 'pending')); });
    assert.deepEqual(audible().map((p) => p.kind), ['new']);
    await advance(29_000);
    assert.equal(audible('urgent').length, 0);
    await advance(1_000);
    assert.equal(audible('urgent').length, 1);
    el('urgent').end(); // first ring of the pair ends: the second follows
    assert.equal(audible('urgent').length, 2);
    el('urgent').end();
    assert.equal(audible('urgent').length, 2, 'a pair, not more');
    await advance(30_000);
    assert.equal(audible('urgent').length, 3);
  });

  await check('Changing to 2 minutes takes effect at once: nothing at 30, 60 or 90 seconds, a ring at 2 minutes', async () => {
    await run(() => alerts.setEvery(120));
    assert.equal(localStorage.getItem('sellio_alert_interval_shop-1'), '120');
    await advance(119_000);
    assert.equal(audible('urgent').length, 0);
    await advance(1_000);
    assert.equal(audible('urgent').length, 1);
  });

  await check('Accepting the order stops its reminders', async () => {
    await run(() => alerts.seen(order('o2', 'confirmed')));
    await advance(10 * 60_000);
    assert.equal(plays.length, 0);
  });

  await check('Orders already waiting when the page opened never ring; the new one stops once accepted', async () => {
    await update({ orders: [order('old1', 'pending'), order('old2', 'pending')] });
    await run(() => alerts.setEvery(60));
    await advance(5 * 60_000);
    assert.equal(plays.length, 0, 'old waiting orders alone: quiet');
    await run(() => { alerts.seen(order('o3', 'pending')); alerts.ring(order('o3', 'pending')); });
    await update({ orders: [order('o3', 'pending'), order('old1', 'pending'), order('old2', 'pending')] });
    await advance(60_000);
    assert.equal(audible('urgent').length, 1);
    await run(() => alerts.seen(order('o3', 'preparing')));
    await advance(5 * 60_000);
    assert.equal(audible('urgent').length, 1, 'quiet again although old orders still wait');
  });

  await check('An order becoming ready rings once; later changes to it (paid, say) do not ring again', async () => {
    await update({ orders: [order('o4', 'preparing')] });
    let before = alerts.seen(order('o4', 'ready'));
    assert.equal(before, 'preparing');
    if (before !== 'ready') await run(() => alerts.ring(order('o4', 'ready'), { remind: false }));
    before = alerts.seen(order('o4', 'ready', { payment_status: 'paid' }));
    assert.equal(before, 'ready');
    assert.equal(audible('new').length, 1);
    await advance(5 * 60_000);
    assert.equal(audible('urgent').length, 0, 'no reminders when asked not to');
  });

  await check("The page's own quick change to the list doesn't hide the change realtime reports", async () => {
    await update({ orders: [order('o5', 'ready')] }); // first seen as ready here...
    await update({ orders: [order('o5', 'completed')] }); // ...the page marks it done itself
    assert.equal(alerts.seen(order('o5', 'completed')), 'ready');
  });

  await check('Turning off while the urgent tone rings stops it at once, and the reminders', async () => {
    await run(() => { alerts.seen(order('o6', 'pending')); alerts.ring(order('o6', 'pending')); });
    await advance(60_000);
    assert.equal(audible('urgent').length, 1);
    reset();
    await run(() => alerts.setOn(false));
    assert.ok(pauses.some((p) => p.kind === 'urgent'), 'the urgent tone is stopped');
    el('urgent').end(); // a pair in progress doesn't carry on
    await advance(10 * 60_000);
    assert.equal(plays.length, 0);
    assert.deepEqual(updates.at(-1).values, { order_alerts: false });
  });

  await check('Changed on the account panel: the open page follows', async () => {
    await run(() => window.dispatchEvent(new dom.window.CustomEvent(ORDER_ALERTS_EVENT, { detail: { on: true } })));
    assert.equal(alerts.on, true);
    await run(() => window.dispatchEvent(new dom.window.CustomEvent(ORDER_ALERTS_EVENT, { detail: { on: false } })));
    assert.equal(alerts.on, false);
    assert.equal(plays.length, 0, 'the panel plays nothing here');
  });

  await check('A missed realtime change: the list stops the reminders; a list from before the order does not', async () => {
    await run(() => alerts.setOn(true));
    reset();
    await update({ orders: [] });
    await run(() => { alerts.seen(order('o7', 'pending')); alerts.ring(order('o7', 'pending')); });
    await update({ orders: [order('x', 'completed')] }); // fetched before o7 existed, arrives just after
    await advance(60_000);
    assert.equal(audible('urgent').length, 1, 'still reminding');
    await update({ orders: [order('o7', 'confirmed')] }); // accepted on another phone, change missed
    await advance(5 * 60_000);
    assert.equal(audible('urgent').length, 1);
    await run(() => { alerts.seen(order('o8', 'pending')); alerts.ring(order('o8', 'pending')); });
    await advance(30_000);
    await update({ orders: [] }); // well after: o8 is gone (done on the kitchen screen, or deleted)
    await advance(5 * 60_000);
    assert.equal(audible('urgent').length, 1, 'o8 never reminded after it went');
  });

  await check('A deleted order (realtime sends only its id) stops its reminders', async () => {
    reset();
    await run(() => { alerts.seen(order('o9', 'pending')); alerts.ring(order('o9', 'pending')); });
    await run(() => alerts.seen({ id: 'o9', status: undefined }));
    await advance(5 * 60_000);
    assert.equal(audible('urgent').length, 0);
  });

  await check('Leaving the page stops the tone and the reminders', async () => {
    await run(() => { alerts.seen(order('o10', 'pending')); alerts.ring(order('o10', 'pending')); });
    reset();
    await leave();
    assert.ok(pauses.length >= 1);
    await advance(10 * 60_000);
    assert.equal(plays.length, 0);
  });

  await check('A slow read of the setting never undoes a change made meanwhile', async () => {
    db.order_alerts = true;
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const original = globalThis.__client.from;
    globalThis.__client.from = (table) => ({ ...original(table), select: () => ({ eq: () => ({ maybeSingle: async () => { await slow; return { data: { order_alerts: true }, error: null }; } }) }) });
    await open();
    await run(() => alerts.setOn(false));
    release();
    await act(async () => { await flush(); await flush(); });
    assert.equal(alerts.on, false);
    globalThis.__client.from = original;
    await leave();
  });

  inApp(false);

  await check('Website: turning on rings the test tone and starts the urgent tone silently from the same tap', async () => {
    db.order_alerts = false;
    await open({ tenantId: 'shop-2' });
    reset();
    await run(() => alerts.setOn(true));
    assert.deepEqual(plays.map((p) => [p.kind, p.muted]), [['new', false], ['urgent', true]]);
    await act(async () => { await flush(); });
    assert.equal(pauses.filter((p) => p.kind === 'new').length, 0, 'the test tone is left to ring');
    assert.equal(el('urgent').muted, false, 'unmuted again after the silent start');
  });

  await check('Website: a tap while a tone rings leaves it alone; the silent start never plays aloud', async () => {
    el('new').end();
    await advance(11_000);
    reset();
    await run(() => { alerts.seen(order('w1', 'pending')); alerts.ring(order('w1', 'pending')); });
    window.dispatchEvent(new dom.window.Event('pointerdown'));
    await act(async () => { await flush(); });
    assert.equal(pauses.filter((p) => p.kind === 'new').length, 0, 'the ringing tone is not stopped');
    assert.ok(plays.filter((p) => p.kind === 'urgent').every((p) => p.muted), 'only muted warm-ups for the idle tone');
    await leave();
  });
} finally {
  Date.now = realNow;
  await rm(tmp, { recursive: true, force: true });
}

console.log(`${passed} order alert checks passed (no phone, no speaker).`);
