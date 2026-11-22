// "Your trial ends soon" only for a trial after which no plan starts: its plan was cancelled (or, on
// Alvin's bypass test shops, no Stripe plan is behind it). Alvin, 15 Jun and 22 Nov 2026;
// src/lib/trialReminder.js. On 22 Nov Cafelicious (Pro trial, not cancelled, card saved) was shown
// it with 3 hours left: two reconcile-billing calls at once deadlocked, and the error showed it.
// Run: node verification/trial-reminder.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Dashboard', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'Node', 'Event', 'sessionStorage', 'localStorage', 'navigator']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-trial-reminder-'));
const local = path.join(process.cwd(), '.trial-reminder-bundle.mjs');
// reconcile-billing is never really called: each test passes its own ask().
const plugin = { name: 'trial-reminder-fixtures', setup(builder) {
  builder.onResolve({ filter: /^@\/lib\/billing$/ }, () => ({ path: 'billing', namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
    loader: 'js',
    contents: "export async function reconcileBilling() { throw new Error('not in tests'); }",
  }));
} };

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const realNow = Date.now;
let clock = Date.parse('2026-11-21T23:45:00Z'); // 07:45 in Singapore, 22 Nov
Date.now = () => clock;
const flush = async () => { await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); }); };

try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export * from '@/lib/trialReminder';" },
    outfile: path.join(tmp, 'trial.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent',
  });
  await copyFile(path.join(tmp, 'trial.mjs'), local);
  const reminder = await import(pathToFileURL(local));
  const { useTrialReminder, trialEndsWithoutPlan, trialHoursLeft } = reminder;

  // The answers reconcile-billing gives. Today's (deployed 20 Nov) has no endsWithTrial.
  const notCancelled = { status: 'trialing', isActive: true, willAutoRenew: true, cancelAtPeriodEnd: false, customerHasPayment: true };
  const noCard = { status: 'trialing', isActive: true, willAutoRenew: false, cancelAtPeriodEnd: false, customerHasPayment: false };
  const cancelledClassic = { status: 'trialing', isActive: true, willAutoRenew: false, cancelAtPeriodEnd: true, customerHasPayment: true };
  // A newer ("flexible") subscription cancelled: Stripe sets cancel_at and leaves cancel_at_period_end false.
  const cancelledFlexible = { ...notCancelled, willAutoRenew: false, cancelAt: '2026-11-22T03:10:11.000Z', endsWithTrial: true };
  const laterEnd = { ...notCancelled, cancelAt: '2027-02-22T03:10:11.000Z', endsWithTrial: false };
  // A trial with no Stripe plan behind it (complete-onboarding gives Alvin's bypass accounts one: Cafetelier).
  const noPlan = { status: 'no_subscription', isActive: false, willAutoRenew: false, subscription: null };

  // ── What counts: no plan starts when the trial ends ────────────────────────────────────────
  assert.equal(trialEndsWithoutPlan(notCancelled), false, 'Cafelicious: a plan that starts by itself');
  assert.equal(trialEndsWithoutPlan(noCard), false, 'no card saved is not a cancellation');
  assert.equal(trialEndsWithoutPlan(cancelledClassic), true);
  assert.equal(trialEndsWithoutPlan(cancelledFlexible), true);
  assert.equal(trialEndsWithoutPlan(laterEnd), false, 'set to end after the trial: the plan still starts');
  assert.equal(trialEndsWithoutPlan({ ...cancelledClassic, endsWithTrial: false }), false, 'endsWithTrial decides when it is sent');
  assert.equal(trialEndsWithoutPlan(noPlan), true, 'no Stripe plan behind the trial: nothing starts, the shop locks');
  assert.equal(trialEndsWithoutPlan({ ...notCancelled, status: 'canceled' }), true, 'cancelled outright');
  for (const answer of [null, undefined, 'error', { error: 'Could not refresh billing status' }, {}]) {
    assert.equal(trialEndsWithoutPlan(answer), false, `no answer: ${JSON.stringify(answer)}`);
  }
  passed('only a trial after which no plan starts: cancelled, or no Stripe plan behind it; not a plan that renews, a missing card, an error or no answer');

  const end = (ms) => new Date(clock + ms).toISOString();
  assert.equal(trialHoursLeft({ status: 'trial', current_period_end: end(3 * HOUR + 25 * MIN) }), 3);
  assert.equal(trialHoursLeft({ status: 'trial', current_period_end: end(24 * HOUR + 59 * MIN) }), 24, 'as before: asked from the 24th hour');
  assert.equal(trialHoursLeft({ status: 'trial', current_period_end: end(25 * HOUR) }), null);
  assert.equal(trialHoursLeft({ status: 'trial', current_period_end: end(-MIN) }), null, 'a trial already over');
  assert.equal(trialHoursLeft({ status: 'active', current_period_end: end(3 * HOUR) }), null);
  assert.equal(trialHoursLeft(null), null);
  passed("asked about only in a trial's last 24 hours");

  // ── The hook, as Layout uses it ────────────────────────────────────────────────────────────
  const state = { shown: false, closable: null, shows: 0, hides: 0 };
  function Harness(props) {
    useTrialReminder({
      ...props,
      show: (closable) => { state.shown = true; state.closable = closable; state.shows++; },
      hide: () => { state.shown = false; state.hides++; },
    });
    return null;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root = createRoot(host);
  const render = async (props) => { await act(async () => { root.render(React.createElement(Harness, props)); }); await flush(); };
  const fresh = async () => {
    await act(async () => root.unmount());
    root = createRoot(host);
    Object.assign(state, { shown: false, closable: null, shows: 0, hides: 0 });
    sessionStorage.clear();
  };
  // A new object on every 30-second plan refresh, as Layout's setSubscription(data) gives.
  const TRIAL_END = '2026-11-22T03:10:11.000Z'; // Cafelicious's trial: 11:10 in Singapore
  const trial = () => ({ status: 'trial', current_period_end: TRIAL_END });
  clock = Date.parse('2026-11-22T03:10:11Z') - (3 * HOUR + 25 * MIN);

  // Cafelicious on 22 Nov: the first answer is the deadlock's error, then "not cancelled".
  let asks = [];
  let answers = [];
  const ask = (tenantId) => {
    asks.push(tenantId);
    const next = answers.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  answers = [new Error('Edge Function returned a non-2xx status code'), notCancelled, notCancelled];
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.equal(asks.length, 1);
  assert.equal(state.shown, false, 'an error shows nothing (it used to show the reminder)');
  for (let i = 0; i < 3; i++) {
    clock += 30 * 1000;
    await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  }
  assert.equal(asks.length, 1, 'not asked again within 2 minutes of an error');
  clock += 31 * 1000; // 2 min 1 s after
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.equal(asks.length, 2, 'asked again after 2 minutes');
  assert.equal(state.shown, false, 'not cancelled: nothing shown');
  for (let i = 0; i < 19; i++) {
    clock += 30 * 1000;
    await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  }
  assert.equal(asks.length, 2, 'every 30-second refresh no longer asks Stripe');
  clock += 31 * 1000;
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.equal(asks.length, 3, 'asked again 10 minutes later');
  assert.equal(state.shows, 0, 'never shown');
  passed('Cafelicious (not cancelled, card saved): never shown, not even when Stripe errors; asked once, then every 10 minutes');

  // Never two questions at a time (two at once deadlocked the billing sync).
  await fresh();
  clock = Date.parse('2026-11-22T03:10:11Z') - 5 * HOUR;
  asks = [];
  let release;
  const slow = (tenantId) => { asks.push(tenantId); return new Promise((resolve) => { release = resolve; }); };
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask: slow });
  for (let i = 0; i < 5; i++) {
    clock += 15 * MIN; // even long after: still waiting for the first answer
    await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask: slow });
  }
  assert.equal(asks.length, 1, 'one question at a time');
  release(notCancelled);
  await flush();
  assert.equal(state.shown, false);
  passed('one question at a time, however often the plan is refreshed');

  // No card saved, not cancelled: nothing (only a cancellation shows it).
  await fresh();
  answers = [noCard];
  asks = [];
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.equal(asks.length, 1);
  assert.equal(state.shown, false);
  passed('a trial with no card saved is not warned about either');

  // Cafetelier: a trial with no Stripe plan behind it locks when it ends: shown.
  await fresh();
  answers = [noPlan];
  asks = [];
  await render({ tenantId: 'cafetelier', isOwner: true, subscription: trial(), ask });
  assert.equal(asks.length, 1);
  assert.deepEqual([state.shown, state.closable], [true, false], 'shown; with 3 hours left, a plan must be chosen');
  passed('a trial with no Stripe plan behind it (bypass test shops) is still warned about');

  // Cancelled: shown. Remind me later with more than 12 hours left; not in the last 12.
  await fresh();
  clock = Date.parse('2026-11-22T03:10:11Z') - 20 * HOUR;
  answers = [cancelledClassic];
  asks = [];
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.deepEqual([state.shown, state.closable], [true, true], 'cancelled, 20 hours left: shown, closable');
  await fresh();
  clock = Date.parse('2026-11-22T03:10:11Z') - 6 * HOUR;
  answers = [cancelledFlexible];
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.deepEqual([state.shown, state.closable], [true, false], 'cancelled (a cancel date, newer subscriptions), 6 hours left: shown, must choose');
  passed('a plan cancelled in its trial: shown (Remind me later only with more than 12 hours left), however Stripe records the cancellation');

  // Cancelled, then the cancellation undone: hidden at the next question.
  answers = [notCancelled];
  clock += 10 * MIN + 1000;
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.equal(state.shown, false, 'no longer cancelled: hidden');
  // Then the trial ends and the plan starts: no longer a trial, hidden and not asked.
  answers = [cancelledClassic];
  clock += 10 * MIN + 1000;
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.equal(state.shown, true);
  const beforeActive = asks.length;
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: { status: 'active', current_period_end: end(30 * 24 * HOUR) }, ask });
  assert.equal(state.shown, false, 'a plan that has started: hidden');
  assert.equal(asks.length, beforeActive, 'and Stripe not asked');
  passed('hidden again when the cancellation is undone or the plan starts');

  // Not asked: more than 24 hours left, staff, another plan, after Remind me later.
  await fresh();
  asks = [];
  answers = [cancelledClassic, cancelledClassic, cancelledClassic, cancelledClassic];
  clock = Date.parse('2026-11-22T03:10:11Z') - 30 * HOUR;
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  clock = Date.parse('2026-11-22T03:10:11Z') - 3 * HOUR;
  await render({ tenantId: 'cafelicious', isOwner: false, subscription: trial(), ask });
  await render({ tenantId: null, isOwner: true, subscription: trial(), ask });
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: null, ask });
  sessionStorage.setItem(reminder.DISMISSED_KEY, 'true');
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask });
  assert.equal(asks.length, 0, 'not asked');
  assert.equal(state.shows, 0);
  passed('not asked with more than 24 hours left, for staff, without a plan, or after Remind me later');

  // Another shop meanwhile: the first shop's answer is not shown on the second.
  await fresh();
  asks = [];
  const pending = [];
  const later = (tenantId) => { asks.push(tenantId); return new Promise((resolve) => pending.push(resolve)); };
  await render({ tenantId: 'cafelicious', isOwner: true, subscription: trial(), ask: later });
  await render({ tenantId: 'perfect-five', isOwner: true, subscription: { status: 'active', current_period_end: end(30 * 24 * HOUR) }, ask: later });
  pending[0](cancelledClassic);
  await flush();
  assert.equal(state.shown, false, "Cafelicious's answer isn't shown on Perfect Five");
  passed("an answer for another shop or trial is ignored");

  await act(async () => root.unmount());

  // Layout: the old reminder (shown on any error, or without a card) is gone; the hook decides.
  const layout = await readFile(path.join(process.cwd(), 'src/Layout.jsx'), 'utf8');
  assert.doesNotMatch(layout, /showing modal anyway|willAutoRenew|functions\.invoke\('reconcile-billing'/);
  assert.match(layout, /useTrialReminder\(\{\s*tenantId,\s*isOwner,\s*subscription,\s*show: \(closable\) => \{ setCanDismissTrialModal\(closable\); setShowTrialModal\(true\); \},\s*hide: \(\) => setShowTrialModal\(false\),\s*\}\);/);
  assert.match(layout, /\{showTrialModal && subscription\?\.status === 'trial' && \(\s*<TrialReminderModal/);
  passed('Layout shows the reminder only through useTrialReminder, and only during a trial');

  console.log(passes + ' trial-reminder checks passed');
} finally {
  Date.now = realNow;
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
